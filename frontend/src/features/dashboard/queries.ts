import { useQuery } from '@tanstack/react-query';
import {
  getDashboardSummary,
  getMovementsChart,
  getRecentMovements,
} from '@/features/dashboard/api';
import { queryKeys } from '@/lib/query-keys';

export function useDashboardSummaryQuery() {
  return useQuery({
    queryKey: queryKeys.dashboard.summary(),
    queryFn: getDashboardSummary,
  });
}

export function useMovementsChartQuery(days: number) {
  return useQuery({
    queryKey: queryKeys.dashboard.movementsChart(days),
    queryFn: () => getMovementsChart(days),
  });
}

export function useRecentMovementsQuery(limit: number) {
  return useQuery({
    queryKey: queryKeys.dashboard.recentMovements(limit),
    queryFn: () => getRecentMovements(limit),
  });
}
