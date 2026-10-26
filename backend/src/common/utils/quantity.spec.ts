import { describe, expect, it } from 'vitest';
import { isPositiveQuantity, isValidFinalQuantity, QUANTITY_PATTERN } from './quantity';

describe('quantity', () => {
  describe('isPositiveQuantity', () => {
    it.each(['0.001', '1', '10.000', '99999999999.999', '0.1'])('aceita %s', (value) => {
      expect(isPositiveQuantity(value)).toBe(true);
    });

    it.each([
      '0',
      '0.0',
      '0.000',
      '-1',
      '-0.001',
      '1.2345',
      '1,5',
      '1e3',
      ' 1',
      '1 ',
      '',
      'abc',
      '100000000000', // 12 dígitos inteiros, acima do teto de 11
    ])('recusa %s', (value) => {
      expect(isPositiveQuantity(value)).toBe(false);
    });
  });

  describe('isValidFinalQuantity', () => {
    it.each(['0', '0.000', '7.000', '99999999999.999'])('aceita %s', (value) => {
      expect(isValidFinalQuantity(value)).toBe(true);
    });

    it.each(['-1', '1.2345', '1e3', '', 'abc', '100000000000'])('recusa %s', (value) => {
      expect(isValidFinalQuantity(value)).toBe(false);
    });
  });

  it('QUANTITY_PATTERN não casa com notação científica nem separador de milhar', () => {
    expect(QUANTITY_PATTERN.test('1e3')).toBe(false);
    expect(QUANTITY_PATTERN.test('1,000.000')).toBe(false);
  });
});
