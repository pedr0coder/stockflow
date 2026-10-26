import { describe, expect, it } from 'vitest';
import {
  PG_CHECK_VIOLATION,
  PG_NUMERIC_OVERFLOW,
  PG_STOCK_MOVEMENT_IMMUTABLE,
  pgErrorCode,
} from './pg-error';

/**
 * O código de alto nível do Prisma (`P2003`, `P2010`, `P2039`...) não basta e
 * às vezes engana: um `RAISE` com `ERRCODE` de classe `restrict_violation`
 * (23xxx) é classificado como `P2003` (violação de chave estrangeira) pelo
 * Prisma. O SQLSTATE verdadeiro vem de
 * `meta.driverAdapterError.cause.originalCode` (docs/17-plano-fase-5.md I19).
 */
describe('pgErrorCode', () => {
  it('extrai o originalCode de um erro no formato do driver adapter', () => {
    const error = { meta: { driverAdapterError: { cause: { originalCode: '23514' } } } };

    expect(pgErrorCode(error)).toBe('23514');
  });

  it('devolve undefined quando não há meta', () => {
    expect(pgErrorCode(new Error('qualquer coisa'))).toBeUndefined();
  });

  it('devolve undefined quando o originalCode não é string', () => {
    const error = { meta: { driverAdapterError: { cause: { originalCode: 42 } } } };

    expect(pgErrorCode(error)).toBeUndefined();
  });

  it('devolve undefined para null, undefined e primitivos', () => {
    expect(pgErrorCode(null)).toBeUndefined();
    expect(pgErrorCode(undefined)).toBeUndefined();
    expect(pgErrorCode('erro em string')).toBeUndefined();
    expect(pgErrorCode(42)).toBeUndefined();
  });

  it('as constantes de SQLSTATE têm os valores documentados', () => {
    expect(PG_CHECK_VIOLATION).toBe('23514');
    expect(PG_NUMERIC_OVERFLOW).toBe('22003');
    // Fora da faixa padrão do Postgres, de propósito: é o SQLSTATE do
    // projeto para o trigger de imutabilidade, para não se confundir com uma
    // restrict_violation genérica (docs/17-plano-fase-5.md §17.8.2).
    expect(PG_STOCK_MOVEMENT_IMMUTABLE).toBe('SF001');
  });
});
