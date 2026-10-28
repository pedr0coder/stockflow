import { HttpStatus } from '@nestjs/common';
import { DomainError } from './domain.error';
import { ErrorCode } from './error-codes';

/**
 * Erros de recurso inexistente.
 *
 * Substituem o `NotFoundException('...')` que os services lançavam. O contrato
 * público não muda: continua 404, `code` `NOT_FOUND` e a mesma mensagem em
 * português. O que muda é quem a declara. Como `NotFoundException` é um erro do
 * framework, o filtro precisava decidir por texto se a mensagem era do projeto
 * ou do Nest (`Cannot GET /...`), e uma lista de exclusão sempre perde a
 * próxima mensagem. Sendo `DomainError`, a mensagem é do projeto por
 * construção, e o service volta a não conhecer HTTP (docs/02-arquitetura.md
 * §2.3).
 *
 * Uma classe por recurso, e não uma só com o nome como parâmetro: a mensagem
 * fica fixa e revisável no mesmo lugar, e o teste de cada service pode apontar
 * para o erro exato em vez de comparar texto.
 *
 * Sem `details` de propósito: a resposta atual não os traz, e o id já está na
 * URL que o cliente chamou.
 */
export abstract class ResourceNotFoundError extends DomainError {
  override readonly code = ErrorCode.NOT_FOUND;
  override readonly httpStatus = HttpStatus.NOT_FOUND;
}

export class CategoryNotFoundError extends ResourceNotFoundError {
  constructor() {
    super('Categoria não encontrada.');
  }
}

export class ProductNotFoundError extends ResourceNotFoundError {
  constructor() {
    super('Produto não encontrado.');
  }
}

export class SupplierNotFoundError extends ResourceNotFoundError {
  constructor() {
    super('Fornecedor não encontrado.');
  }
}

export class UserNotFoundError extends ResourceNotFoundError {
  constructor() {
    super('Usuário não encontrado.');
  }
}

export class StockMovementNotFoundError extends ResourceNotFoundError {
  constructor() {
    super('Movimentação não encontrada.');
  }
}

export class InventoryNotFoundError extends ResourceNotFoundError {
  constructor() {
    super('Inventário não encontrado.');
  }
}

/** Também usado quando o item existe, mas pertence a outro inventário (docs/17 §17.4.3). */
export class InventoryItemNotFoundError extends ResourceNotFoundError {
  constructor() {
    super('Item de inventário não encontrado.');
  }
}
