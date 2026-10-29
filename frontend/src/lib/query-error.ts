import type { DataTableStatus } from '@/components/shared/DataTable';
import { ApiError } from '@/lib/api-client';

/**
 * Converte o erro de uma `useQuery` no estado de erro do `DataTable`.
 *
 * Repetido em toda tela de listagem (categorias, fornecedores, produtos,
 * depois movimentações e inventários no 6C) — centralizado aqui para que as
 * três telas deste marco não divirjam em como extraem `code` de `ApiError`.
 */
export function toDataTableErrorState(error: unknown, onRetry: () => void): DataTableStatus {
  return {
    status: 'error',
    ...(error instanceof ApiError && error.code !== undefined ? { code: error.code } : {}),
    onRetry,
  };
}
