import { request } from '@/lib/api-client';
import type { MovementType } from '@/components/shared/MovementTypeBadge';

/** Forma exata de `DashboardSummaryDto` (backend/src/dashboard/dto/dashboard.dto.ts). */
export interface DashboardSummary {
  activeProducts: number;
  lowStock: number;
  outOfStock: number;
  movementsLast30Days: number;
}

/** Forma exata de `MovementsChartPointDto`. Array simples, sem envelope de paginação. */
export interface MovementsChartPoint {
  day: string;
  type: MovementType;
  total: number;
}

/** Forma exata de `RecentMovementDto`. Array simples, sem envelope de paginação. */
export interface RecentMovement {
  id: string;
  productId: string;
  productName: string;
  type: MovementType;
  reason: string;
  quantity: string;
  stockAfter: string;
  userName: string;
  createdAt: string;
}

/** `GET /dashboard/summary`. */
export function getDashboardSummary(): Promise<DashboardSummary> {
  return request<DashboardSummary>('/dashboard/summary');
}

/** `GET /dashboard/movements-chart?days=1..90`. */
export function getMovementsChart(days: number): Promise<MovementsChartPoint[]> {
  return request<MovementsChartPoint[]>(`/dashboard/movements-chart?days=${String(days)}`);
}

/** `GET /dashboard/recent-movements?limit=1..50`. */
export function getRecentMovements(limit: number): Promise<RecentMovement[]> {
  return request<RecentMovement[]>(`/dashboard/recent-movements?limit=${String(limit)}`);
}
