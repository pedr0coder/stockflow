import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { PinoLogger } from 'nestjs-pino';
import { v7 as uuidv7 } from 'uuid';
import { isDomainError } from '../errors/domain.error';
import { ApiErrorResponse, ErrorCode } from '../errors/error-codes';

/**
 * Mensagem genérica de 5xx.
 *
 * Fixa e sem contexto de propósito: a causa real vai para o log, junto do
 * mesmo `requestId` que o cliente recebe. Assim um usuário consegue relatar
 * "deu erro, o id é X" e o problema é investigável sem que a resposta HTTP
 * tenha exposto nome de tabela, consulta ou caminho de arquivo.
 */
const GENERIC_SERVER_MESSAGE = 'Erro interno. Tente novamente em alguns instantes.';

/** Usada quando o status 4xx não tem texto próprio na tabela abaixo. */
const GENERIC_CLIENT_MESSAGE = 'Requisição inválida.';

/**
 * Limiar entre "a API recusou a requisição" e "a API quebrou".
 *
 * Número literal e não `HttpStatus.INTERNAL_SERVER_ERROR`: `statusCode` no
 * contrato é `number`, e comparar número com membro de enum numérico é
 * exatamente o que a regra `no-unsafe-enum-comparison` existe para apontar.
 */
const SERVER_ERROR_THRESHOLD = 500;

/** Menor status de erro atribuível ao cliente. */
const CLIENT_ERROR_THRESHOLD = 400;

/**
 * Política de allowlist estrita para mensagens de erro (Marco 7B / S12).
 *
 * ┌────────────────────────────────────────────────────────────────────────────┐
 * │ O contrato (§2.6) estabelece que `message` é texto seguro para o usuário  │
 * │ final, em português, e que detalhes internos de framework, biblioteca ou  │
 * │ infraestrutura jamais devem vazar na resposta HTTP.                        │
 * │                                                                            │
 * │ Em vez de uma blocklist de expressões regulares (`FRAMEWORK_MESSAGES`,     │
 * │ que só bloqueava padrões já conhecidos depois de terem vazado), este       │
 * │ filtro opera por **allowlist estrita**:                                    │
 * │                                                                            │
 * │   1. `isDomainError(exception)` → erro de negócio nosso (`DomainError`):   │
 * │      expõe `exception.message`, `exception.code`, `exception.httpStatus`   │
 * │      e `exception.details` (quando definido).                              │
 * │   2. `HttpException` (NestJS, guards, pipes, rotas inexistentes, etc.) →   │
 * │      NUNCA expõe `exception.message`; usa sempre a mensagem canônica de    │
 * │      `STATUS_TO_MESSAGE[statusCode]` (ou `GENERIC_CLIENT_MESSAGE` para     │
 * │      4xx não tabelado / `GENERIC_SERVER_MESSAGE` para 5xx), preservando    │
 * │      apenas `details.fields` quando a exceção vem do `ValidationPipe`.     │
 * │   3. Outros erros → se trouxerem status 4xx válido de middleware           │
 * │      (`body-parser`), usam `STATUS_TO_MESSAGE`; qualquer outro caso        │
 * │      retorna 500 `INTERNAL_ERROR` com `GENERIC_SERVER_MESSAGE`.            │
 * └────────────────────────────────────────────────────────────────────────────┘
 */

/** Texto padrão por status, usado para qualquer erro que não seja `DomainError`. */
const STATUS_TO_MESSAGE: Readonly<Record<number, string>> = {
  [HttpStatus.BAD_REQUEST]: 'Dados inválidos. Verifique os campos informados.',
  [HttpStatus.UNAUTHORIZED]: 'Sessão inválida ou expirada. Entre novamente.',
  [HttpStatus.FORBIDDEN]: 'Você não tem permissão para esta ação.',
  [HttpStatus.NOT_FOUND]: 'Recurso não encontrado.',
  [HttpStatus.CONFLICT]: 'A operação conflita com o estado atual do recurso.',
  [HttpStatus.UNPROCESSABLE_ENTITY]: 'A operação não pôde ser processada.',
  [HttpStatus.PAYLOAD_TOO_LARGE]: 'Corpo da requisição acima do limite aceito.',
  [HttpStatus.TOO_MANY_REQUESTS]: 'Muitas tentativas. Aguarde alguns minutos.',
  [HttpStatus.SERVICE_UNAVAILABLE]: 'Serviço temporariamente indisponível.',
};

/** Status HTTP → `code` padrão, quando o erro não traz um código próprio. */
const STATUS_TO_CODE: Readonly<Record<number, ErrorCode>> = {
  [HttpStatus.BAD_REQUEST]: ErrorCode.VALIDATION_ERROR,
  [HttpStatus.UNAUTHORIZED]: ErrorCode.UNAUTHORIZED,
  [HttpStatus.FORBIDDEN]: ErrorCode.FORBIDDEN,
  [HttpStatus.NOT_FOUND]: ErrorCode.NOT_FOUND,
  [HttpStatus.CONFLICT]: ErrorCode.CONFLICT,
  [HttpStatus.UNPROCESSABLE_ENTITY]: ErrorCode.UNPROCESSABLE_ENTITY,
  [HttpStatus.PAYLOAD_TOO_LARGE]: ErrorCode.PAYLOAD_TOO_LARGE,
  [HttpStatus.TOO_MANY_REQUESTS]: ErrorCode.RATE_LIMIT_EXCEEDED,
  [HttpStatus.SERVICE_UNAVAILABLE]: ErrorCode.SERVICE_UNAVAILABLE,
};

/**
 * Filtro global de exceção: garante que **toda** resposta de erro da API tenha
 * a mesma forma (docs/02-arquitetura.md §2.6).
 *
 * Sem ele, o frontend precisaria tratar três formatos diferentes: o do
 * ValidationPipe, o das HttpException do Nest e o de um erro não tratado.
 */
@Catch()
@Injectable()
export class AllExceptionsFilter implements ExceptionFilter {
  constructor(private readonly logger: PinoLogger) {
    this.logger.setContext(AllExceptionsFilter.name);
  }

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const request = ctx.getRequest<Request & { id?: string }>();
    const response = ctx.getResponse<Response>();

    // O id é gerado pelo pino-http no início da requisição. O fallback cobre o
    // caso de a exceção acontecer antes de o middleware de log rodar.
    const requestId = request.id ?? uuidv7();

    // `originalUrl` e não `url`: o prefixo global monta um sub-router, e dentro
    // dele `req.url` já vem sem o `/api/v1`. O cliente precisa do caminho que
    // ele realmente chamou, senão o campo não serve para investigar nada.
    const path = request.originalUrl ?? request.url;
    const body = this.toErrorResponse(exception, path, requestId);

    if (body.statusCode >= SERVER_ERROR_THRESHOLD) {
      // 5xx: stack completo no log, nada disso na resposta.
      this.logger.error(
        { err: exception, requestId, path: request.url, method: request.method },
        'erro não tratado',
      );
    } else {
      // 4xx é comportamento esperado da API, não falha do servidor.
      this.logger.warn(
        { requestId, code: body.code, statusCode: body.statusCode, path: request.url },
        body.message,
      );
    }

    response.status(body.statusCode).json(body);
  }

  private toErrorResponse(exception: unknown, path: string, requestId: string): ApiErrorResponse {
    const base = { timestamp: new Date().toISOString(), path, requestId };

    if (isDomainError(exception)) {
      return {
        ...base,
        statusCode: exception.httpStatus,
        code: exception.code,
        message: exception.message,
        ...(exception.details !== undefined ? { details: exception.details } : {}),
      };
    }

    if (exception instanceof HttpException) {
      const rawStatus = exception.getStatus();
      const isServerError = rawStatus >= SERVER_ERROR_THRESHOLD;
      const statusCode = isServerError ? HttpStatus.INTERNAL_SERVER_ERROR : rawStatus;
      const details = isServerError ? undefined : this.extractValidationDetails(exception);
      const fallback = isServerError
        ? GENERIC_SERVER_MESSAGE
        : (STATUS_TO_MESSAGE[statusCode] ?? GENERIC_CLIENT_MESSAGE);

      return {
        ...base,
        statusCode,
        code: isServerError
          ? ErrorCode.INTERNAL_ERROR
          : (STATUS_TO_CODE[statusCode] ?? ErrorCode.VALIDATION_ERROR),
        message: fallback,
        ...(details !== undefined ? { details } : {}),
      };
    }

    /**
     * ┌────────────────────────────────────────────────────────────────────────┐
     * │ Erro de middleware do Express, que NÃO é `HttpException`.              │
     * │                                                                        │
     * │ O `body-parser` segue a convenção `http-errors`: lança um `Error`      │
     * │ comum com `status` e `expose`. Dois casos acontecem todo dia:          │
     * │                                                                        │
     * │   corpo além do limite  → status 413                                   │
     * │   JSON malformado       → status 400                                   │
     * │                                                                        │
     * │ Sem este trecho os dois caíam no 500 genérico. O cliente que esqueceu  │
     * │ uma vírgula no JSON recebia "Erro interno. Tente novamente", que é     │
     * │ falso e manda a pessoa procurar no lugar errado — e cada um desses     │
     * │ erros era registrado como falha do servidor, enchendo o alerta de 5xx  │
     * │ com erro de cliente.                                                   │
     * │                                                                        │
     * │ Só 4xx é aproveitado. Um `status` 5xx vindo de origem desconhecida     │
     * │ continua virando o 500 genérico: aí o erro é nosso, e a mensagem não   │
     * │ deve vazar o que aconteceu.                                            │
     * └────────────────────────────────────────────────────────────────────────┘
     */
    const statusCode = clientErrorStatusOf(exception);

    if (statusCode !== undefined) {
      return {
        ...base,
        statusCode,
        code: STATUS_TO_CODE[statusCode] ?? ErrorCode.VALIDATION_ERROR,
        message: STATUS_TO_MESSAGE[statusCode] ?? GENERIC_CLIENT_MESSAGE,
      };
    }

    return {
      ...base,
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      code: ErrorCode.INTERNAL_ERROR,
      message: GENERIC_SERVER_MESSAGE,
    };
  }

  /**
   * Extrai exclusivamente os detalhes estruturados de validação (`details.fields`)
   * quando a `HttpException` provém do `ValidationPipe`.
   *
   * Pela política de allowlist estrita (S12), strings avulsas em `HttpException`
   * nunca são repassadas para `message` nem para `details`: todo erro de
   * negócio legítimo do projeto herda de `DomainError`.
   */
  private extractValidationDetails(exception: HttpException): { fields: unknown } | undefined {
    const payload = exception.getResponse();

    if (typeof payload === 'object' && payload !== null && 'fields' in payload) {
      return { fields: payload.fields };
    }

    const raw = typeof payload === 'string' ? payload : (payload as { message?: unknown }).message;

    if (Array.isArray(raw)) {
      return { fields: raw };
    }

    return undefined;
  }
}

/**
 * Status 4xx carregado por um erro que não é `HttpException`.
 *
 * Devolve `undefined` quando não há status utilizável, para que quem chama caia
 * no 500 genérico. A mensagem do erro original é deliberadamente ignorada: ela
 * vem de biblioteca, em inglês, e pode citar detalhe de implementação.
 */
function clientErrorStatusOf(exception: unknown): number | undefined {
  if (typeof exception !== 'object' || exception === null) {
    return undefined;
  }

  const candidate = exception as { status?: unknown; statusCode?: unknown };
  const raw = typeof candidate.status === 'number' ? candidate.status : candidate.statusCode;

  if (typeof raw !== 'number' || !Number.isInteger(raw)) {
    return undefined;
  }

  return raw >= CLIENT_ERROR_THRESHOLD && raw < SERVER_ERROR_THRESHOLD ? raw : undefined;
}
