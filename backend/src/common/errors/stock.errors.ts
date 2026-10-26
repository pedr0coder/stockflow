import { HttpStatus } from '@nestjs/common';
import { DomainError } from './domain.error';
import { ErrorCode } from './error-codes';
import type { MovementReason, MovementType } from '../../generated/prisma/enums';

/**
 * Erros de domínio da movimentação de estoque (Fase 5, marco 5A).
 *
 * Nascem de dentro da transação que decide o saldo (docs/17-plano-fase-5.md
 * §17.5.3): o UPDATE condicional já tomou a decisão de recusar, e estas
 * classes só carregam o motivo para a resposta HTTP. `details` traz só o que
 * o cliente pode ver — nunca SQL, nunca nome de constraint.
 */

/**
 * Saída (ou ajuste) maior do que o saldo disponível.
 *
 * `available` é um RETRATO, não uma garantia: entre o UPDATE condicional (que
 * já decidiu a recusa, atomicamente) e esta leitura, outra transação pode ter
 * mudado o saldo. A decisão já foi tomada; isto só descreve a situação para
 * quem lê a resposta.
 */
export class InsufficientStockError extends DomainError {
  override readonly code = ErrorCode.INSUFFICIENT_STOCK;
  override readonly httpStatus = HttpStatus.CONFLICT;

  constructor(productId: string, available: string, requested: string) {
    super('Estoque insuficiente para a saída solicitada.', { productId, available, requested });
  }
}

/** Movimentação contra produto inativo. Entrada, saída e ajuste manual exigem produto ativo. */
export class ProductInactiveError extends DomainError {
  override readonly code = ErrorCode.PRODUCT_INACTIVE;
  override readonly httpStatus = HttpStatus.CONFLICT;

  constructor(productId: string) {
    super('Este produto está inativo e não aceita movimentação.', { productId });
  }
}

/**
 * Combinação `type` × `reason` fora da matriz (docs/04-banco-de-dados.md §4.3).
 *
 * `allowed` lista os motivos que o `type` aceita, para que o cliente corrija
 * sem precisar adivinhar pela mensagem.
 */
export class InvalidTypeReasonError extends DomainError {
  override readonly code = ErrorCode.INVALID_TYPE_REASON;
  override readonly httpStatus = HttpStatus.UNPROCESSABLE_ENTITY;

  constructor(type: MovementType, reason: MovementReason, allowed: readonly MovementReason[]) {
    super(`O motivo "${reason}" não é válido para o tipo "${type}".`, { type, reason, allowed });
  }
}
