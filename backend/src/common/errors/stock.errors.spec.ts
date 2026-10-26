import { HttpStatus } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { isDomainError } from './domain.error';
import { ErrorCode } from './error-codes';
import {
  InsufficientStockError,
  InvalidTypeReasonError,
  ProductInactiveError,
} from './stock.errors';
import { MovementReason, MovementType } from '../../generated/prisma/enums';

describe('erros de movimentação de estoque', () => {
  it('InsufficientStockError é 409 com productId, available e requested', () => {
    const error = new InsufficientStockError('p1', '8.000', '12.500');

    expect(isDomainError(error)).toBe(true);
    expect(error.httpStatus).toBe(HttpStatus.CONFLICT);
    expect(error.code).toBe(ErrorCode.INSUFFICIENT_STOCK);
    expect(error.details).toEqual({ productId: 'p1', available: '8.000', requested: '12.500' });
  });

  it('ProductInactiveError é 409 com productId', () => {
    const error = new ProductInactiveError('p1');

    expect(error.httpStatus).toBe(HttpStatus.CONFLICT);
    expect(error.code).toBe(ErrorCode.PRODUCT_INACTIVE);
    expect(error.details).toEqual({ productId: 'p1' });
  });

  it('InvalidTypeReasonError é 422 com type, reason e allowed', () => {
    const error = new InvalidTypeReasonError(MovementType.OUT, MovementReason.PURCHASE, [
      MovementReason.SALE,
    ]);

    expect(error.httpStatus).toBe(HttpStatus.UNPROCESSABLE_ENTITY);
    expect(error.code).toBe(ErrorCode.INVALID_TYPE_REASON);
    expect(error.details).toEqual({
      type: MovementType.OUT,
      reason: MovementReason.PURCHASE,
      allowed: [MovementReason.SALE],
    });
  });
});
