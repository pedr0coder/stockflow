import { useQuery } from '@tanstack/react-query';
import {
  getDivergencesReport,
  getInventoriesReport,
  getLowStockReport,
  getMovementsReport,
  getOutOfStockReport,
  getStockReconciliationReport,
} from '@/features/reports/api';
import { queryKeys } from '@/lib/query-keys';

export function useLowStockReportQuery(enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.reports.lowStock(),
    queryFn: getLowStockReport,
    enabled,
  });
}

export function useOutOfStockReportQuery(enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.reports.outOfStock(),
    queryFn: getOutOfStockReport,
    enabled,
  });
}

export function useMovementsReportQuery(
  params: { dateFrom?: string; dateTo?: string },
  enabled: boolean,
) {
  return useQuery({
    queryKey: queryKeys.reports.movements(params),
    queryFn: () => getMovementsReport(params),
    enabled,
  });
}

export function useInventoriesReportQuery(enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.reports.inventories(),
    queryFn: getInventoriesReport,
    enabled,
  });
}

export function useDivergencesReportQuery(enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.reports.divergences(),
    queryFn: getDivergencesReport,
    enabled,
  });
}

export function useStockReconciliationReportQuery(enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.reports.stockReconciliation(),
    queryFn: getStockReconciliationReport,
    enabled,
  });
}
