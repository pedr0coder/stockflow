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

/**
 * Limiar entre "a API recusou a requisição" e "a API quebrou".
 *
 * Número literal e não `HttpStatus.INTERNAL_SERVER_ERROR`: `statusCode` no
 * contrato é `number`, e comparar número com membro de enum numérico é
 * exatamente o que a regra `no-unsafe-enum-comparison` existe para apontar.
 */
const SERVER_ERROR_THRESHOLD = 500;

/**
 * Mensagem do Nest para rota inexistente: `Cannot GET /caminho`.
 *
 * Ela vaza a forma do framework e está em inglês, enquanto o contrato diz que
 * `message` é texto para o usuário final em português (§2.6). Quando o filtro
 * reconhece esse padrão, trata a exceção como "sem mensagem própria" e usa o
 * texto padrão do status.
 */
const FRAMEWORK_ROUTE_MISS = /^Cannot (GET|POST|PUT|PATCH|DELETE|OPTIONS|HEAD) \//;

/** Texto padrão por status, usado quando a exceção não traz mensagem própria. */
const STATUS_TO_MESSAGE: Readonly<Record<number, string>> = {
  [HttpStatus.BAD_REQUEST]: 'Dados inválidos. Verifique os campos informados.',
  [HttpStatus.UNAUTHORIZED]: 'Sessão inválida ou expirada. Entre novamente.',
  [HttpStatus.FORBIDDEN]: 'Você não tem permissão para esta ação.',
  [HttpStatus.NOT_FOUND]: 'Recurso não encontrado.',
  [HttpStatus.CONFLICT]: 'A operação conflita com o estado atual do recurso.',
  [HttpStatus.UNPROCESSABLE_ENTITY]: 'A operação não pôde ser processada.',
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
    const raw = typeof payload === 'string' ? payload : (payload as { message?: unknown }).message;

    if (Array.isArray(raw)) {
      return { message: undefined, details: { fields: raw } };
    }

    if (typeof raw === 'string' && raw.length > 0) {
      return { message: FRAMEWORK_ROUTE_MISS.test(raw) ? undefined : raw };
    }

    return { message: undefined };
  }
}
