import { HttpStatus } from '@nestjs/common';
import { DomainError } from './domain.error';
import { ErrorCode } from './error-codes';

/**
 * Erros de conflito de recurso.
 *
 * Todos nascem de violação de índice único no banco (`P2002` no Prisma). A
 * tradução acontece **no service**, que sabe qual campo falhou. Um filtro
 * global para `P2002` teria de adivinhar se o conflito foi de e-mail, SKU ou
 * documento, e adivinharia errado em algum caso.
 */

export class EmailAlreadyExistsError extends DomainError {
  override readonly code = ErrorCode.EMAIL_ALREADY_EXISTS;
  override readonly httpStatus = HttpStatus.CONFLICT;

  constructor(email: string) {
    super('Já existe um usuário com este e-mail.', { email });
  }
}

export class SkuAlreadyExistsError extends DomainError {
  override readonly code = ErrorCode.SKU_ALREADY_EXISTS;
  override readonly httpStatus = HttpStatus.CONFLICT;

  constructor(sku: string) {
    super('Já existe um produto com este SKU.', { sku });
  }
}

/** Conflito genérico de unicidade, com o campo nomeado. */
export class UniqueConstraintError extends DomainError {
  override readonly code = ErrorCode.CONFLICT;
  override readonly httpStatus = HttpStatus.CONFLICT;

  constructor(field: string, message: string) {
    super(message, { field });
  }
}

/**
 * Tentativa de inativar categoria que ainda tem produto ativo.
 *
 * A verificação e a escrita acontecem na mesma instrução SQL, pelo mesmo
 * raciocínio do ADR-0003: separá-las deixaria espaço para um produto ser criado
 * entre a checagem e a inativação.
 */
export class CategoryHasProductsError extends DomainError {
  override readonly code = ErrorCode.CATEGORY_HAS_PRODUCTS;
  override readonly httpStatus = HttpStatus.CONFLICT;

  constructor() {
    super('Esta categoria tem produtos ativos. Mova ou inative os produtos antes de inativá-la.');
  }
}

/**
 * Regra de negócio violada com entrada bem formada.
 *
 * 422 e não 400: a requisição estava correta em forma, e o que a recusou foi a
 * regra (docs/05-api.md §5.1).
 */
export class BusinessRuleError extends DomainError {
  override readonly code = ErrorCode.UNPROCESSABLE_ENTITY;
  override readonly httpStatus = HttpStatus.UNPROCESSABLE_ENTITY;

  constructor(message: string, details?: Record<string, unknown>) {
    super(message, details);
  }
}
