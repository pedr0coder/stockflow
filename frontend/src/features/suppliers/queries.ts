import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createSupplier,
  getSupplier,
  listSupplierProducts,
  listSuppliers,
  setSupplierStatus,
  updateSupplier,
  type SupplierInput,
  type SupplierListParams,
} from '@/features/suppliers/api';
import { queryKeys } from '@/lib/query-keys';

export function useSuppliersQuery(params: SupplierListParams) {
  return useQuery({
    queryKey: queryKeys.suppliers.list(params),
    queryFn: () => listSuppliers(params),
  });
}

export function useSupplierQuery(id: string) {
  return useQuery({
    queryKey: queryKeys.suppliers.detail(id),
    queryFn: () => getSupplier(id),
    enabled: id.length > 0,
  });
}

export function useSupplierProductsQuery(id: string, params: { page?: number }) {
  return useQuery({
    queryKey: queryKeys.suppliers.products(id, params),
    queryFn: () => listSupplierProducts(id, params),
  });
}

function useInvalidateSuppliers(id?: string) {
  const queryClient = useQueryClient();

  return () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.suppliers.lists() });

    if (id !== undefined) {
      void queryClient.invalidateQueries({ queryKey: queryKeys.suppliers.detail(id) });
    }
  };
}

export function useCreateSupplierMutation() {
  const invalidate = useInvalidateSuppliers();

  return useMutation({
    mutationFn: (input: SupplierInput) => createSupplier(input),
    onSuccess: () => invalidate(),
  });
}

export function useUpdateSupplierMutation(id: string) {
  const invalidate = useInvalidateSuppliers(id);

  return useMutation({
    mutationFn: (input: Partial<SupplierInput>) => updateSupplier(id, input),
    onSuccess: () => invalidate(),
  });
}

export function useSetSupplierStatusMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      setSupplierStatus(id, isActive),
    onSuccess: (_result, { id }) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.suppliers.lists() });
      void queryClient.invalidateQueries({ queryKey: queryKeys.suppliers.detail(id) });
    },
  });
}
