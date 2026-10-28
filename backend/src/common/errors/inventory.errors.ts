import { HttpStatus } from '@nestjs/common';
import { DomainError } from './domain.error';
import { ErrorCode } from './error-codes';

/**
 * Erros do ciclo de inventário (marco 5B, docs/17-plano-fase-5.md §17.4.3).
 *
 * Cada transição é um `UPDATE` condicionado ao estado de origem; zero linhas
 * não diz por quê, e a leitura que classifica acontece na mesma transação
 * (o mesmo raciocínio do ADR-0003, aplicado ao estado em vez do saldo).
 */

export class InventoryNotOpenError extends DomainError {
  override readonly code = ErrorCode.INVENTORY_NOT_OPEN;
  override readonly httpStatus = HttpStatus.CONFLICT;

  constructor(currentStatus: string) {
    super('O inventário não está aberto para esta operação.', { currentStatus });
  }
}

export class InventoryAlreadyApprovedError extends DomainError {
  override readonly code = ErrorCode.INVENTORY_ALREADY_APPROVED;
  override readonly httpStatus = HttpStatus.CONFLICT;

  constructor() {
    super('Este inventário já foi aprovado.');
  }
}

export class InventoryInvalidStateError extends DomainError {
  override readonly code = ErrorCode.INVENTORY_INVALID_STATE;
  override readonly httpStatus = HttpStatus.CONFLICT;

  constructor(currentStatus: string, attempted: string) {
    super('O inventário não pode fazer esta transição a partir do estado atual.', {
      currentStatus,
      attempted,
    });
  }
}

export class ProductInOpenInventoryError extends DomainError {
  override readonly code = ErrorCode.PRODUCT_IN_OPEN_INVENTORY;
  override readonly httpStatus = HttpStatus.CONFLICT;

  constructor(retained: { productId: string; inventoryId: string }[]) {
    super('Um ou mais produtos já estão em outro inventário não finalizado.', { retained });
  }
}

/** Enviar ou aprovar sem nenhum item contado (D6). */
export class NoItemsCountedError extends DomainError {
  override readonly code = ErrorCode.UNPROCESSABLE_ENTITY;
  override readonly httpStatus = HttpStatus.UNPROCESSABLE_ENTITY;

  constructor() {
    super('O inventário não tem nenhum item contado.');
  }
}

/** Seleção com algum produto inexistente na abertura. */
export class ProductsNotFoundForInventoryError extends DomainError {
  override readonly code = ErrorCode.UNPROCESSABLE_ENTITY;
  override readonly httpStatus = HttpStatus.UNPROCESSABLE_ENTITY;

  constructor(productIds: string[]) {
    super('Um ou mais produtos selecionados não existem.', { productIds });
  }
}

/**
 * Aprovação que levaria o saldo de algum produto abaixo de zero (S6).
 *
 * `details` traz todos os itens problemáticos da aprovação atual, não só o
 * primeiro encontrado — a mesma exigência do §17.6.4: o operador registra o
 * que falta e aprova de novo, sem precisar descobrir um item por vez.
 */
export class InventoryApprovalInsufficientStockError extends DomainError {
  override readonly code = ErrorCode.INSUFFICIENT_STOCK;
  override readonly httpStatus = HttpStatus.CONFLICT;

  constructor(
    problems: {
      productId: string;
      inventoryItemId: string;
      available: string;
      requested: string;
      expectedQty: string;
      countedQty: string;
    }[],
  ) {
    super('A aprovação deixaria o saldo de um ou mais produtos negativo.', { problems });
  }
}
