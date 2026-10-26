import { MovementReason, MovementType } from '../../generated/prisma/enums';

/**
 * Matriz `type` × `reason` (docs/04-banco-de-dados.md §4.3).
 *
 * Fica também como CHECK no banco (migration `phase5a_stock_integrity`), mas
 * validar aqui primeiro dá a mensagem certa (`InvalidTypeReasonError`, 422,
 * com `allowed`) em vez de deixar a requisição virar uma violação de
 * constraint genérica. O CHECK é a última linha de defesa, não a primeira —
 * mesmo raciocínio do ADR-0003.
 *
 * `INVENTORY_ADJUSTMENT` fica de fora de `ADJUSTMENT` aqui de propósito: é
 * reservado à aprovação de inventário (Fase 5B), e aceitá-lo no ajuste manual
 * permitiria forjar um ajuste com cara de contagem.
 */
export const ALLOWED_REASONS: Readonly<Record<MovementType, readonly MovementReason[]>> = {
  [MovementType.IN]: [
    MovementReason.PURCHASE,
    MovementReason.RETURN_IN,
    MovementReason.PRODUCTION_IN,
    MovementReason.TRANSFER_IN,
  ],
  [MovementType.OUT]: [
    MovementReason.SALE,
    MovementReason.CONSUMPTION,
    MovementReason.LOSS,
    MovementReason.EXPIRY,
    MovementReason.TRANSFER_OUT,
  ],
  [MovementType.ADJUSTMENT]: [MovementReason.CORRECTION],
};

/** `true` quando a combinação é válida. */
export function isReasonAllowed(type: MovementType, reason: MovementReason): boolean {
  return ALLOWED_REASONS[type].includes(reason);
}
