import { HttpStatus } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { describe, expect, it } from 'vitest';
import { QueryInventoriesDto } from '../../inventories/dto/query-inventories.dto';
import { buildPage } from '../dto/page.dto';
import { isDomainError } from '../errors/domain.error';
import { ErrorCode } from '../errors/error-codes';
import { InvalidSortColumnError, resolveSortColumn, toSkipTake } from './pagination';

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

  it('recusa coluna fora da lista com InvalidSortColumnError (DomainError 400)', () => {
    expect(() => resolveSortColumn('passwordHash', COLUNAS, 'name')).toThrow(
      InvalidSortColumnError,
    );

    try {
      resolveSortColumn('passwordHash', COLUNAS, 'name');
    } catch (error) {
      expect(isDomainError(error)).toBe(true);
      expect((error as InvalidSortColumnError).httpStatus).toBe(HttpStatus.BAD_REQUEST);
      expect((error as InvalidSortColumnError).code).toBe(ErrorCode.VALIDATION_ERROR);
    }
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
    expect(() => resolveSortColumn('SKU', COLUNAS, 'name')).toThrow(InvalidSortColumnError);
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

describe('QueryInventoriesDto (contrato de ordenação)', () => {
  it('aceita page=1, sort=startedAt e order=desc com whitelist/forbidNonWhitelisted', () => {
    const dto = plainToInstance(QueryInventoriesDto, {
      page: '1',
      sort: 'startedAt',
      order: 'desc',
    });
    const errors = validateSync(dto, { whitelist: true, forbidNonWhitelisted: true });

    expect(errors).toHaveLength(0);
    expect(dto.sort).toBe('startedAt');
    expect(dto.order).toBe('desc');
  });

  it('rejeita valor de sort fora de INVENTORY_SORT_COLUMNS', () => {
    const dto = plainToInstance(QueryInventoriesDto, {
      page: '1',
      sort: 'code',
      order: 'desc',
    });
    const errors = validateSync(dto, { whitelist: true, forbidNonWhitelisted: true });

    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]?.property).toBe('sort');
  });
});
