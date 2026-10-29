import { request } from '@/lib/api-client';

/** `GET /reports/low-stock`. A/M/O. */
export interface LowStockItem {
  id: string;
  sku: string;
  name: string;
  currentStock: string;
  minStock: string;
  deficit: string;
}

/** `GET /reports/out-of-stock`. A/M/O. */
export interface OutOfStockItem {
  id: string;
  sku: string;
  name: string;
}

/** `GET /reports/movements`. A/M/O. Pré-agregado por tipo+motivo no servidor. */
export interface MovementsReportRow {
  type: string;
  reason: string;
  movementsCount: number;
  totalQuantity: string;
}

/** `GET /reports/inventories`. ADMIN/MANAGER. */
export interface InventoryReportRow {
  id: string;
  code: string;
  status: string;
  startedAt: string;
  closedAt: string | null;
  itemsCount: number;
  countedCount: number;
  adjustedCount: number;
}

/** `GET /reports/divergences`. ADMIN/MANAGER. */
export interface DivergenceRow {
  inventoryId: string;
  inventoryCode: string;
  itemId: string;
  productId: string;
  productName: string;
  expectedQty: string;
  countedQty: string;
  movedSinceCount: string;
}

/** `GET /reports/stock-reconciliation`. ADMIN apenas. */
export interface ReconciliationRow {
  id: string;
  sku: string;
  name: string;
  currentStock: string;
  derivedStock: string;
  difference: string;
}

/**
 * Nenhum dos seis relatórios é paginado — todos devolvem um array simples,
 * não o envelope `PageDto` (conferido direto nos controllers, não assumido
 * por semelhança com o resto da API).
 */
export function getLowStockReport(): Promise<LowStockItem[]> {
  return request<LowStockItem[]>('/reports/low-stock');
}

export function getOutOfStockReport(): Promise<OutOfStockItem[]> {
  return request<OutOfStockItem[]>('/reports/out-of-stock');
}

export function getMovementsReport(params: {
  dateFrom?: string;
  dateTo?: string;
}): Promise<MovementsReportRow[]> {
  const search = new URLSearchParams();

  if (params.dateFrom !== undefined && params.dateFrom.length > 0) {
    search.set('dateFrom', params.dateFrom);
  }

  if (params.dateTo !== undefined && params.dateTo.length > 0) {
    search.set('dateTo', params.dateTo);
  }

  const query = search.toString();

  return request<MovementsReportRow[]>(`/reports/movements${query.length > 0 ? `?${query}` : ''}`);
}

export function getInventoriesReport(): Promise<InventoryReportRow[]> {
  return request<InventoryReportRow[]>('/reports/inventories');
}

export function getDivergencesReport(): Promise<DivergenceRow[]> {
  return request<DivergenceRow[]>('/reports/divergences');
}

export function getStockReconciliationReport(): Promise<ReconciliationRow[]> {
  return request<ReconciliationRow[]>('/reports/stock-reconciliation');
}
