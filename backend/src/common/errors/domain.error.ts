import { HttpStatus } from '@nestjs/common';
import { ErrorCode } from './error-codes';

/**
 * Base de todo erro de **regra de negócio**.
 *
 * Por que uma classe própria em vez de lançar `HttpException` direto do service:
 * o service não deve conhecer HTTP (docs/02-arquitetura.md §2.3). Ele lança
 * `InsufficientStockError`; quem traduz isso em 409 é o filtro. Assim o mesmo
 * service é testável sem subir servidor, e a regra continua válida se um dia
 * for chamada de um job ou de um comando de CLI.
 *
 * `httpStatus` fica aqui, e não no filtro, porque é parte do contrato público
 * do erro: "estoque insuficiente é 409" é uma decisão de API, e deixá-la ao
 * lado do código do erro impede que duas rotas respondam diferente para a
 * mesma causa.
 */
export abstract class DomainError extends Error {
  abstract readonly code: ErrorCode;
  abstract readonly httpStatus: HttpStatus;

  /**
   * Contexto estruturado que **vai para a resposta**. Só entra aqui o que o
   * cliente pode ver: saldo disponível, quantidade pedida, id do recurso.
   * Nunca hash, token, consulta SQL ou mensagem do driver.
   */
  readonly details?: Record<string, unknown>;

  protected constructor(message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = new.target.name;
    if (details !== undefined) {
      this.details = details;
    }
    Error.captureStackTrace?.(this, new.target);
  }
}

/**
 * Guard de tipo usado pelo filtro.
 *
 * `instanceof DomainError` falharia se o erro cruzasse um limite de módulo com
 * duas cópias da classe carregadas (acontece com link simbólico de dependência
 * e em alguns setups de teste). A checagem estrutural é imune a isso.
 */
export function isDomainError(error: unknown): error is DomainError {
  return (
    error instanceof Error &&
    typeof (error as DomainError).code === 'string' &&
    typeof (error as DomainError).httpStatus === 'number'
  );
}
