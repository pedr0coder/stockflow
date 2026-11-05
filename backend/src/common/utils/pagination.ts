import { HttpStatus } from '@nestjs/common';
import { DomainError } from '../errors/domain.error';
import { ErrorCode } from '../errors/error-codes';

/**
 * Coluna de ordenação fora da allowlist do recurso.
 *
 * Herda de `DomainError` para que o `AllExceptionsFilter` opere em regime de
 * allowlist estrita (apenas `DomainError` expõe `exception.message` ao
 * cliente; qualquer `HttpException` de framework ou biblioteca recebe a
 * mensagem canônica de `STATUS_TO_MESSAGE`).
 */
export class InvalidSortColumnError extends DomainError {
  override readonly code = ErrorCode.VALIDATION_ERROR;
  override readonly httpStatus = HttpStatus.BAD_REQUEST;

  constructor(requested: string, allowed: readonly string[]) {
    super(`Ordenação inválida: "${requested}". Valores aceitos: ${allowed.join(', ')}.`);
  }
}

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
    throw new InvalidSortColumnError(requested, allowed);
  }

  return match;
}

/** Converte página e tamanho no `skip`/`take` do Prisma. */
export function toSkipTake(page: number, limit: number): { skip: number; take: number } {
  return { skip: (page - 1) * limit, take: limit };
}
