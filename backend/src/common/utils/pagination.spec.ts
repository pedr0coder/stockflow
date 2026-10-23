import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { buildPage } from '../dto/page.dto';
import { resolveSortColumn, toSkipTake } from './pagination';

const COLUNAS = ['name', 'sku', 'createdAt'] as const;

/**
 * A allowlist de ordenação é controle de segurança, não conveniência: o valor
 * de `sort` vai parar no `orderBy` do ORM, e aceitar qualquer string deixaria
 * o cliente escolher por qual coluna o banco ordena, inclusive colunas que ele
 * não deveria saber que existem (docs/05-api.md §5.1).
 */
describe('resolveSortColumn', () => {
  it('aceita coluna da lista', () => {
    expect(resolveSortColumn('sku', COLUNAS, 'name')).toBe('sku');
  });

  it('usa o padrão quando nada é pedido', () => {
    expect(resolveSortColumn(undefined, COLUNAS, 'name')).toBe('name');
    expect(resolveSortColumn('', COLUNAS, 'name')).toBe('name');
  });

  it('recusa coluna fora da lista', () => {
    expect(() => resolveSortColumn('passwordHash', COLUNAS, 'name')).toThrow(BadRequestException);
  });

  it('recusa em vez de cair no padrão em silêncio', () => {
    // Cair no padrão esconderia um erro de integração do cliente, que
    // continuaria pedindo a coluna errada sem nunca saber.
    try {
      resolveSortColumn('qualquerCoisa', COLUNAS, 'name');
      throw new Error('deveria ter lançado');
    } catch (error) {
      expect((error as Error).message).toContain('name, sku, createdAt');
    }
  });

  it('é sensível a maiúsculas: "SKU" não é "sku"', () => {
    expect(() => resolveSortColumn('SKU', COLUNAS, 'name')).toThrow(BadRequestException);
  });
});

describe('toSkipTake', () => {
  it('converte a primeira página', () => {
    expect(toSkipTake(1, 20)).toEqual({ skip: 0, take: 20 });
  });

  it('converte páginas seguintes', () => {
    expect(toSkipTake(3, 10)).toEqual({ skip: 20, take: 10 });
  });
});

describe('buildPage', () => {
  it('calcula o total de páginas e os indicadores', () => {
    const page = buildPage([1, 2, 3], 25, 1, 10);

    expect(page.meta).toEqual({
      page: 1,
      limit: 10,
      total: 25,
      totalPages: 3,
      hasNext: true,
      hasPrev: false,
    });
  });

  it('marca a última página corretamente', () => {
    expect(buildPage([], 25, 3, 10).meta).toMatchObject({
      totalPages: 3,
      hasNext: false,
      hasPrev: true,
    });
  });

  it('listagem vazia reporta zero páginas, não uma página vazia', () => {
    // O cliente distingue "não há nada" de "a página 1 está vazia".
    expect(buildPage([], 0, 1, 20).meta).toMatchObject({
      total: 0,
      totalPages: 0,
      hasNext: false,
      hasPrev: false,
    });
  });
});
