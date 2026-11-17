import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createProduct,
  deleteProduct,
  getProduct,
  listProductMovements,
  listProducts,
  setProductStatus,
  updateProduct,
  type ProductInput,
  type ProductListParams,
} from '@/features/products/api';
import { queryKeys } from '@/lib/query-keys';

export function useProductsQuery(params: ProductListParams) {
  return useQuery({
    queryKey: queryKeys.products.list(params),
    queryFn: () => listProducts(params),
  });
}

export function useProductQuery(id: string) {
  return useQuery({
    queryKey: queryKeys.products.detail(id),
    queryFn: () => getProduct(id),
    enabled: id.length > 0,
  });
}

export function useProductMovementsQuery(id: string, params: { page?: number }) {
  return useQuery({
    queryKey: queryKeys.products.movements(id, params),
    queryFn: () => listProductMovements(id, params),
    enabled: id.length > 0,
  });
}

function useInvalidateProducts(id?: string) {
  const queryClient = useQueryClient();

  return () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.products.lists() });
    void queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.all });
    void queryClient.invalidateQueries({ queryKey: queryKeys.reports.all });
    void queryClient.invalidateQueries({ queryKey: queryKeys.suppliers.all });

    if (id !== undefined) {
      void queryClient.invalidateQueries({ queryKey: queryKeys.products.detail(id) });
    }
  };
}

export function useCreateProductMutation() {
  const invalidate = useInvalidateProducts();

  return useMutation({
    mutationFn: (input: ProductInput) => createProduct(input),
    onSuccess: () => invalidate(),
  });
}

export function useUpdateProductMutation(id: string) {
  const invalidate = useInvalidateProducts(id);

  return useMutation({
    mutationFn: (input: Partial<ProductInput>) => updateProduct(id, input),
    onSuccess: () => invalidate(),
  });
}

export function useSetProductStatusMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      setProductStatus(id, isActive),
    onSuccess: (_result, { id }) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.products.lists() });
      void queryClient.invalidateQueries({ queryKey: queryKeys.products.detail(id) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.reports.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.suppliers.all });
    },
  });
}

export function useDeleteProductMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => deleteProduct(id),
    onSuccess: (_result, id) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.products.lists() });
      void queryClient.invalidateQueries({ queryKey: queryKeys.products.detail(id) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.stockMovements.lists() });
      void queryClient.invalidateQueries({ queryKey: queryKeys.reports.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.inventories.lists() });
      void queryClient.invalidateQueries({ queryKey: queryKeys.suppliers.all });
    },
  });
}
