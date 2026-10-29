import { describe, expect, it } from 'vitest';
import { FALLBACK_ERROR_MESSAGE, messageForCode } from './error-messages';

/**
 * Os 15 códigos de negócio reais (docs/18-plano-fase-6.md §18.1, achado 1),
 * conferidos direto em `backend/src/common/errors/error-codes.ts` — um por
 * um, para que a lista aqui não possa divergir em silêncio da de lá.
 */
const REAL_BUSINESS_CODES = [
  'INSUFFICIENT_STOCK',
  'PRODUCT_INACTIVE',
  'SKU_ALREADY_EXISTS',
  'EMAIL_ALREADY_EXISTS',
  'INVALID_CREDENTIALS',
  'USER_INACTIVE',
  'CATEGORY_HAS_PRODUCTS',
  'INVENTORY_NOT_OPEN',
  'INVENTORY_ALREADY_APPROVED',
  'INVALID_TYPE_REASON',
  'REFRESH_TOKEN_REUSED',
  'FORBIDDEN_ROLE',
  'PAYLOAD_TOO_LARGE',
  'INVENTORY_INVALID_STATE',
  'PRODUCT_IN_OPEN_INVENTORY',
] as const;

describe('messageForCode', () => {
  it.each(REAL_BUSINESS_CODES)('tem mensagem própria para %s', (code) => {
    const message = messageForCode(code);

    expect(message).not.toBe(FALLBACK_ERROR_MESSAGE);
    expect(message.length).toBeGreaterThan(0);
  });

  it('código desconhecido cai no texto genérico, nunca exibe o próprio código', () => {
    expect(messageForCode('ALGO_QUE_NAO_EXISTE')).toBe(FALLBACK_ERROR_MESSAGE);
  });

  it('sem código nenhum, cai no texto genérico', () => {
    expect(messageForCode(undefined)).toBe(FALLBACK_ERROR_MESSAGE);
  });

  it('override da tela, quando presente, vence o mapa', () => {
    expect(messageForCode('INSUFFICIENT_STOCK', 'Faltam 3 unidades.')).toBe('Faltam 3 unidades.');
  });

  it('override vazio não vence — cai no mapa', () => {
    expect(messageForCode('NOT_FOUND', '')).toBe(
      'O registro não foi encontrado. Ele pode ter sido removido.',
    );
  });
});
