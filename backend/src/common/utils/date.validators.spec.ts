import { describe, expect, it } from 'vitest';
import { isIsoDateOrDateTimeString } from './date.validators';

describe('isIsoDateOrDateTimeString (M7B-4)', () => {
  describe('formatos válidos preservados pelo contrato público', () => {
    it.each([
      '2026-01-01',
      '2026-10-31',
      '2026-02-28',
      '2024-02-29', // ano bissexto real
      '2026-10-01T00:00:00Z',
      '2026-10-01T23:59:59.999Z',
      '2026-10-01T14:30:00-03:00',
      '2026-10-01T14:30:00+02:00',
      '2026-10-01T14:30:00',
    ])('aceita %s e garante que new Date(value) é finito', (input) => {
      expect(isIsoDateOrDateTimeString(input)).toBe(true);
      expect(Number.isNaN(new Date(input).getTime())).toBe(false);
    });
  });

  describe('limites de calendário e datas inexistentes (sem rollover silencioso)', () => {
    it.each([
      '2026-02-29', // 2026 não é bissexto
      '2026-02-30',
      '2026-02-31',
      '2026-04-31',
      '2026-06-31',
      '2026-09-31',
      '2026-11-31',
      '2026-00-10',
      '2026-13-01',
      '2026-01-00',
      '2026-01-32',
      '2026-02-31T10:00:00Z',
      '2026-02-29T00:00:00-03:00',
    ])('rejeita %s', (input) => {
      expect(isIsoDateOrDateTimeString(input)).toBe(false);
    });
  });

  describe('formatos ISO parciais ou sem separador que causavam Invalid Date / HTTP 500', () => {
    it.each([
      '2026-W01',
      '2026-W01-1',
      '20260101',
      '20261001T120000Z',
      '2026-10',
      '2026',
      '2026-10-01 12:00:00', // espaço em vez de T
      'nao-e-data',
      '',
    ])('rejeita %s', (input) => {
      expect(isIsoDateOrDateTimeString(input)).toBe(false);
    });

    it('rejeita valores não textuais', () => {
      expect(isIsoDateOrDateTimeString(undefined)).toBe(false);
      expect(isIsoDateOrDateTimeString(null)).toBe(false);
      expect(isIsoDateOrDateTimeString(1700000000000)).toBe(false);
      expect(isIsoDateOrDateTimeString({})).toBe(false);
    });
  });
});
