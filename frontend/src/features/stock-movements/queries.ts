import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createAdjustment,
  createInMovement,
  createOutMovement,
  getMovement,
  listMovements,
  type AdjustmentInput,
  type MovementInput,
  type MovementListParams,
} from '@/features/stock-movements/api';
import { queryKeys } from '@/lib/query-keys';

export function useMovementsQuery(params: MovementListParams) {
  return useQuery({
    queryKey: queryKeys.stockMovements.list(params),
    queryFn: () => listMovements(params),
  });
}

export function useMovementQuery(id: string) {
  return useQuery({
    queryKey: queryKeys.stockMovements.detail(id),
    queryFn: () => getMovement(id),
    enabled: id.length > 0,
  });
}

/**
 * Uma movimentação muda o saldo do produto: invalida a lista de produtos (a
 * coluna de saldo mudou), o detalhe e o histórico do produto afetado, a
 * própria lista de movimentações e o dashboard (indicadores e gráfico
 * dependem de movimentação) — docs/18-plano-fase-6.md §18.8.
 */
function useInvalidateAfterMovement() {
  const queryClient = useQueryClient();

  return (productId: string) => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.products.lists() });
    void queryClient.invalidateQueries({ queryKey: queryKeys.products.detail(productId) });
    void queryClient.invalidateQueries({
      queryKey: queryKeys.products.movements(productId, {}),
      exact: false,
    });
    void queryClient.invalidateQueries({ queryKey: queryKeys.stockMovements.lists() });
    void queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.all });
  };
}

export function useCreateInMovementMutation() {
  const invalidate = useInvalidateAfterMovement();

  return useMutation({
    mutationFn: (input: MovementInput) => createInMovement(input),
    onSuccess: (_result, input) => invalidate(input.productId),
  });
}

export function useCreateOutMovementMutation() {
  const invalidate = useInvalidateAfterMovement();

  return useMutation({
    mutationFn: (input: MovementInput) => createOutMovement(input),
    onSuccess: (_result, input) => invalidate(input.productId),
  });
}

export function useCreateAdjustmentMutation() {
  const invalidate = useInvalidateAfterMovement();

  return useMutation({
    mutationFn: (input: AdjustmentInput) => createAdjustment(input),
    onSuccess: (_result, input) => invalidate(input.productId),
  });
}
