import { BadRequestException } from '@nestjs/common';

/**
 * Resolve a coluna de ordenação contra uma allowlist.
 *
 * O `sort` chega da query string, e o destino dele é o `orderBy` do Prisma.
 * Passar o valor direto significaria deixar o cliente escolher por qual coluna
 * o banco ordena, inclusive colunas que ele não deveria sequer saber que
 * existem (docs/05-api.md §5.1).
 *
 * A validação fica aqui, e não em um decorator do DTO, porque a lista muda por
 * recurso e precisa aparecer ao lado da consulta que a usa.
 *
 * Em caso de valor fora da lista, devolve 400 com os valores aceitos. Cair no
 * padrão em silêncio esconderia um erro de integração do cliente.
 */
export function resolveSortColumn<T extends string>(
  requested: string | undefined,
  allowed: readonly T[],
  fallback: T,
): T {
  if (requested === undefined || requested.length === 0) {
    return fallback;
  }

  const match = allowed.find((column) => column === requested);

  if (!match) {
    throw new BadRequestException(
      `Ordenação inválida: "${requested}". Valores aceitos: ${allowed.join(', ')}.`,
    );
  }

  return match;
}

/** Converte página e tamanho no `skip`/`take` do Prisma. */
export function toSkipTake(page: number, limit: number): { skip: number; take: number } {
  return { skip: (page - 1) * limit, take: limit };
}
