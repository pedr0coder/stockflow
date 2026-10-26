import { describe, expect, it } from 'vitest';
import { MovementReason, MovementType } from '../../generated/prisma/enums';
import { ALLOWED_REASONS, isReasonAllowed } from './movement-rules';

/** Toda a matriz `type × reason`, cada motivo contra cada tipo (docs/07-testes.md §7.3). */
describe('movement-rules', () => {
  it.each(Object.values(MovementType))('%s aceita exatamente os motivos esperados', (type) => {
    for (const reason of Object.values(MovementReason)) {
      expect(isReasonAllowed(type, reason)).toBe(ALLOWED_REASONS[type].includes(reason));
    }
  });

  it('IN aceita PURCHASE, RETURN_IN, PRODUCTION_IN e TRANSFER_IN', () => {
    expect(isReasonAllowed(MovementType.IN, MovementReason.PURCHASE)).toBe(true);
    expect(isReasonAllowed(MovementType.IN, MovementReason.RETURN_IN)).toBe(true);
    expect(isReasonAllowed(MovementType.IN, MovementReason.PRODUCTION_IN)).toBe(true);
    expect(isReasonAllowed(MovementType.IN, MovementReason.TRANSFER_IN)).toBe(true);
  });

  it('IN recusa SALE (motivo de saída)', () => {
    expect(isReasonAllowed(MovementType.IN, MovementReason.SALE)).toBe(false);
  });

  it('OUT aceita SALE, CONSUMPTION, LOSS, EXPIRY e TRANSFER_OUT', () => {
    expect(isReasonAllowed(MovementType.OUT, MovementReason.SALE)).toBe(true);
    expect(isReasonAllowed(MovementType.OUT, MovementReason.CONSUMPTION)).toBe(true);
    expect(isReasonAllowed(MovementType.OUT, MovementReason.LOSS)).toBe(true);
    expect(isReasonAllowed(MovementType.OUT, MovementReason.EXPIRY)).toBe(true);
    expect(isReasonAllowed(MovementType.OUT, MovementReason.TRANSFER_OUT)).toBe(true);
  });

  it('OUT recusa PURCHASE (motivo de entrada)', () => {
    expect(isReasonAllowed(MovementType.OUT, MovementReason.PURCHASE)).toBe(false);
  });

  it('ADJUSTMENT aceita somente CORRECTION', () => {
    expect(isReasonAllowed(MovementType.ADJUSTMENT, MovementReason.CORRECTION)).toBe(true);
    expect(ALLOWED_REASONS[MovementType.ADJUSTMENT]).toEqual([MovementReason.CORRECTION]);
  });

  it('ADJUSTMENT recusa INVENTORY_ADJUSTMENT no ajuste manual (reservado à aprovação de inventário, Fase 5B)', () => {
    expect(isReasonAllowed(MovementType.ADJUSTMENT, MovementReason.INVENTORY_ADJUSTMENT)).toBe(
      false,
    );
  });
});
