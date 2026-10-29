import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createCategory,
  getCategory,
  listCategories,
  setCategoryStatus,
  updateCategory,
  type CategoryInput,
  type CategoryListParams,
} from '@/features/categories/api';
import { queryKeys } from '@/lib/query-keys';

export function useCategoriesQuery(params: CategoryListParams) {
  return useQuery({
    queryKey: queryKeys.categories.list(params),
    queryFn: () => listCategories(params),
  });
}

export function useCategoryQuery(id: string) {
  return useQuery({
    queryKey: queryKeys.categories.detail(id),
    queryFn: () => getCategory(id),
    enabled: id.length > 0,
  });
}

/**
 * Depois de toda mutação de escrita, invalidação explícita — nunca
 * atualização otimista (docs/18-plano-fase-6.md §18.8): o nome pode colidir,
 * ou a categoria pode ter sido desativada por outra pessoa entre a leitura e
 * o clique.
 */
function useInvalidateCategories() {
  const queryClient = useQueryClient();

  return () => queryClient.invalidateQueries({ queryKey: queryKeys.categories.lists() });
}

export function useCreateCategoryMutation() {
  const invalidate = useInvalidateCategories();

  return useMutation({
    mutationFn: (input: CategoryInput) => createCategory(input),
    onSuccess: () => invalidate(),
  });
}

export function useUpdateCategoryMutation() {
  const invalidate = useInvalidateCategories();

  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: Partial<CategoryInput> }) =>
      updateCategory(id, input),
    onSuccess: () => invalidate(),
  });
}

export function useSetCategoryStatusMutation() {
  const invalidate = useInvalidateCategories();

  return useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      setCategoryStatus(id, isActive),
    onSuccess: () => invalidate(),
  });
}
