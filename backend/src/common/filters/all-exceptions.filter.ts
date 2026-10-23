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
 * Mensagens geradas por framework ou biblioteca, que NÃO vão para o cliente.
 *
 * ┌────────────────────────────────────────────────────────────────────────────┐
 * │ O contrato (§2.6) diz que `message` é texto para o usuário final, em      │
 * │ português. Algumas exceções chegam aqui com mensagem escrita pelo Nest ou │
 * │ por biblioteca, em inglês e citando detalhe interno:                      │
 * │                                                                            │
 * │   Cannot GET /caminho                        rota inexistente              │
 * │   ThrottlerException: Too Many Requests      nome da classe do guard       │
 * │   Expected property name or '}' in JSON at position 1   corpo malformado   │
 * │                                                                            │
 * │ Quando o padrão casa, o filtro trata a exceção como "sem mensagem própria" │
 * │ e aplica o texto padrão do status.                                        │
 * │                                                                            │
 * │ É uma lista de exclusão, e isso tem o defeito óbvio de listas de exclusão: │
 * │ a próxima mensagem de framework não estará aqui. A alternativa — confiar   │
 * │ só em mensagem de erro de domínio — exigiria converter todo               │
 * │ `NotFoundException('...')` dos services em classe própria, e essa troca    │
 * │ está registrada como pendência, não feita de improviso no meio da fase.   │
 * │                                                                            │
 * │ Os dois últimos padrões entraram porque os testes de segurança pegaram as  │
 * │ mensagens vazando na resposta.                                            │
 * └────────────────────────────────────────────────────────────────────────────┘
 */
const FRAMEWORK_MESSAGES: readonly RegExp[] = [
  /^Cannot (GET|POST|PUT|PATCH|DELETE|OPTIONS|HEAD) \//,
  /^\w+Exception: /,
  /in JSON at position \d+/,
  /^Unexpected (token|end of JSON input)/,
];

/** `true` quando a mensagem foi escrita por framework, e não por este projeto. */
function isFrameworkMessage(message: string): boolean {
  return FRAMEWORK_MESSAGES.some((pattern) => pattern.test(message));
}

/** Texto padrão por status, usado quando a exceção não traz mensagem própria. */
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
      const statusCode = exception.getStatus();
      const { message, details } = this.unwrapHttpException(exception);
      const fallback = STATUS_TO_MESSAGE[statusCode] ?? GENERIC_SERVER_MESSAGE;

      return {
        ...base,
        statusCode,
        code: STATUS_TO_CODE[statusCode] ?? ErrorCode.INTERNAL_ERROR,
        message: message ?? fallback,
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
   * Extrai mensagem e detalhes de uma `HttpException`.
   *
   * Devolve `message: undefined` quando a exceção não tem mensagem própria, e
   * nesse caso quem chama aplica o texto padrão do status.
   *
   * O ValidationPipe lança `BadRequestException` cujo corpo tem `message` como
   * **array** de strings, uma por campo inválido. Jogar esse array no campo
   * `message` daria ao usuário um texto ilegível, então ele vai para `details`
   * e `message` fica com a frase única do status.
   */
  private unwrapHttpException(exception: HttpException): {
    message: string | undefined;
    details?: unknown;
  } {
    const payload = exception.getResponse();

    // Erro de validação: `validationExceptionFactory` já entregou os campos
    // nomeados, e `message` fica com a frase única do status.
    if (typeof payload === 'object' && payload !== null && 'fields' in payload) {
      return { message: undefined, details: { fields: payload.fields } };
    }

    const raw = typeof payload === 'string' ? payload : (payload as { message?: unknown }).message;

    if (Array.isArray(raw)) {
      return { message: undefined, details: { fields: raw } };
    }

    if (typeof raw === 'string' && raw.length > 0) {
      return { message: isFrameworkMessage(raw) ? undefined : raw };
    }

    return { message: undefined };
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
