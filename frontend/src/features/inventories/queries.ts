import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  approveInventory,
  cancelInventory,
  countItem,
  getInventory,
  listInventories,
  openInventory,
  submitInventory,
  type InventoryListParams,
} from '@/features/inventories/api';
import { queryKeys } from '@/lib/query-keys';

export function useInventoriesQuery(params: InventoryListParams) {
  return useQuery({
    queryKey: queryKeys.inventories.list(params),
    queryFn: () => listInventories(params),
  });
}

export function useInventoryQuery(id: string) {
  return useQuery({
    queryKey: queryKeys.inventories.detail(id),
    queryFn: () => getInventory(id),
    enabled: id.length > 0,
  });
}

export function useOpenInventoryMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: { productIds: string[]; note?: string }) => openInventory(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.inventories.lists() });
      void queryClient.invalidateQueries({ queryKey: queryKeys.reports.all });
    },
  });
}

export function useCountItemMutation(inventoryId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ itemId, countedQty }: { itemId: string; countedQty: string }) =>
      countItem(inventoryId, itemId, countedQty),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.inventories.detail(inventoryId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.inventories.lists() });
      void queryClient.invalidateQueries({ queryKey: queryKeys.reports.all });
    },
  });
}

export function useSubmitInventoryMutation(id: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => submitInventory(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.inventories.detail(id) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.inventories.lists() });
      void queryClient.invalidateQueries({ queryKey: queryKeys.reports.all });
    },
  });
}

/**
 * Aprovar muda o saldo de todo produto ajustado — invalida a lista de
 * produtos e o detalhe/histórico de cada um (não só o inventário), além do
 * dashboard e movimentações, igual a uma movimentação comum (docs/18-plano-fase-6.md §18.8).
 */
export function useApproveInventoryMutation(id: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => approveInventory(id),
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.inventories.detail(id) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.inventories.lists() });
      void queryClient.invalidateQueries({ queryKey: queryKeys.products.lists() });
      void queryClient.invalidateQueries({ queryKey: queryKeys.stockMovements.lists() });
      void queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.reports.all });

      for (const adjustment of result.adjustments) {
        void queryClient.invalidateQueries({
          queryKey: queryKeys.products.detail(adjustment.productId),
        });
        void queryClient.invalidateQueries({
          queryKey: queryKeys.products.movements(adjustment.productId, {}),
          exact: false,
        });
      }
    },
  });
}

export function useCancelInventoryMutation(id: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => cancelInventory(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.inventories.detail(id) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.inventories.lists() });
      void queryClient.invalidateQueries({ queryKey: queryKeys.reports.all });
    },
  });
}
