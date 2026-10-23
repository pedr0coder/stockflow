import { ApiProperty } from '@nestjs/swagger';

/**
 * Metadados de paginação.
 *
 * `hasNext` e `hasPrev` são derivados, e existem para que o cliente não precise
 * recalcular a mesma conta em cada tela. Contrato da docs/05-api.md §5.1.
 */
export class PageMetaDto {
  @ApiProperty({ example: 1 })
  page!: number;

  @ApiProperty({ example: 20 })
  limit!: number;

  @ApiProperty({ example: 137 })
  total!: number;

  @ApiProperty({ example: 7 })
  totalPages!: number;

  @ApiProperty({ example: true })
  hasNext!: boolean;

  @ApiProperty({ example: false })
  hasPrev!: boolean;
}

/**
 * Envelope de toda listagem da API.
 *
 * Uma forma só para todas as listagens: o cliente escreve o tratamento de
 * paginação uma vez e reaproveita em todas as telas.
 */
export class PageDto<T> {
  data!: T[];

  @ApiProperty({ type: PageMetaDto })
  meta!: PageMetaDto;
}

/** Monta o envelope a partir do total e dos parâmetros da consulta. */
export function buildPage<T>(data: T[], total: number, page: number, limit: number): PageDto<T> {
  // `Math.ceil` de zero é zero, então uma listagem vazia reporta zero páginas,
  // e não uma página vazia. O cliente distingue "não há nada" de "a página 1
  // está vazia".
  const totalPages = Math.ceil(total / limit);

  return {
    data,
    meta: {
      page,
      limit,
      total,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1 && total > 0,
    },
  };
}
