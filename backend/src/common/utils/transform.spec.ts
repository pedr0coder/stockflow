import { describe, expect, it } from 'vitest';
import { toBooleanValue, toIntValue, trimLowerValue, trimUpperValue, trimValue } from './transform';

describe('transform helpers (M7B-4)', () => {
  describe('trimValue / trimLowerValue / trimUpperValue', () => {
    it('remove espaços das pontas e preserva valores não textuais', () => {
      expect(trimValue({ value: '  texto  ' })).toBe('texto');
      expect(trimValue({ value: 123 })).toBe(123);
      expect(trimLowerValue({ value: '  Ana@Empresa.Local ' })).toBe('ana@empresa.local');
      expect(trimUpperValue({ value: '  fer-0001 ' })).toBe('FER-0001');
    });
  });

  describe('toBooleanValue', () => {
    it('converte apenas "true" e "false" estritos', () => {
      expect(toBooleanValue({ value: 'true' })).toBe(true);
      expect(toBooleanValue({ value: 'false' })).toBe(false);
      expect(toBooleanValue({ value: true })).toBe(true);
      expect(toBooleanValue({ value: 'talvez' })).toBe('talvez');
    });
  });

  describe('toIntValue', () => {
    it('converte inteiros válidos em string ou número', () => {
      expect(toIntValue({ value: '1' })).toBe(1);
      expect(toIntValue({ value: ' 20 ' })).toBe(20);
      expect(toIntValue({ value: '-5' })).toBe(-5);
      expect(toIntValue({ value: 42 })).toBe(42);
    });

    it.each(['10abc', '15.9', '1e3', '', '   ', 'NaN', 'Infinity'])(
      'preserva a string original "%s" quando não é inteiro estrito para que @IsInt() rejeite com 400',
      (invalid) => {
        expect(toIntValue({ value: invalid })).toBe(invalid);
      },
    );
  });
});
