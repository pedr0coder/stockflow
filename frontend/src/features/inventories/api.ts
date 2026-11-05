import { request } from '@/lib/api-client';
import { buildPageParams, type Page } from '@/lib/pagination';
import type { ListParams } from '@/lib/query-keys';

/** Espelha `InventoryStatus` (backend/src/generated/prisma/enums.ts). */
export const INVENTORY_STATUSES = [
  'OPEN',
  'COUNTING',
  'PENDING_APPROVAL',
  'APPROVED',
  'CANCELLED',
] as const;
export type InventoryStatusValue = (typeof INVENTORY_STATUSES)[number];

export const STATUS_LABEL: Readonly<Record<InventoryStatusValue, string>> = {
  OPEN: 'Aberto',
  COUNTING: 'Em contagem',
  PENDING_APPROVAL: 'Aguardando aprovação',
  APPROVED: 'Aprovado',
  CANCELLED: 'Cancelado',
};

export interface InventoryUser {
  id: string;
  name: string;
}

/**
 * `divergence`, `movedSinceCount` e `movementsSinceCount` nunca são colunas
 * persistidas — o backend os calcula na consulta, por desenho, para nunca
 * ficarem inconsistentes com o que os gerou (comentário de
 * `InventoryItemDto`, backend/src/inventories/dto/inventory.dto.ts). Tudo
 * fica `null` até o item ser contado.
 *
 * `productSku`/`productName` vêm em `GET /inventories/:id` (Marco 7C, M7C-2) e
 * são opcionais no tipo porque a resposta de `PATCH .../items/:id` não os traz.
 */
export interface InventoryItem {
  id: string;
  productId: string;
  productSku?: string;
  productName?: string;
  expectedQty: string | null;
  countedQty: string | null;
  divergence: string | null;
  countedAt: string | null;
  countedBy: InventoryUser | null;
  currentStock: string | null;
  movedSinceCount: string | null;
  movementsSinceCount: number | null;
}

/** `items` só vem preenchido em `GET /inventories/:id`, não na listagem. */
export interface Inventory {
  id: string;
  code: string;
  status: InventoryStatusValue;
  note: string | null;
  startedAt: string;
  closedAt: string | null;
  createdBy: InventoryUser;
  approvedBy: InventoryUser | null;
  approvedAt: string | null;
  items?: InventoryItem[];
}

export interface InventoryAdjustment {
  inventoryItemId: string;
  productId: string;
  appliedDelta: string;
  movedSinceCount: string;
  stockBefore: string;
  stockAfter: string;
  movementId: string;
}

export interface InventoryApprovalResult {
  inventory: Inventory;
  adjustments: InventoryAdjustment[];
  adjustedItemsCount: number;
}

export interface InventoryListParams extends ListParams {
  status?: InventoryStatusValue;
}

/** `GET /inventories`. A/M/O. */
export function listInventories(params: InventoryListParams): Promise<Page<Inventory>> {
  return request<Page<Inventory>>(`/inventories${buildPageParams(params)}`);
}

/** `GET /inventories/:id`. A/M/O. */
export function getInventory(id: string): Promise<Inventory> {
  return request<Inventory>(`/inventories/${id}`);
}

/**
 * `POST /inventories`. ADMIN/MANAGER. De 1 a 200 produtos — limite do
 * servidor (`OpenInventoryDto`), não um detalhe de UI.
 */
export function openInventory(input: { productIds: string[]; note?: string }): Promise<Inventory> {
  return request<Inventory>('/inventories', { method: 'POST', body: JSON.stringify(input) });
}

/**
 * `PATCH /inventories/:id/items/:itemId/count`. A/M/O. `countedQty` é o
 * valor absoluto contado, válido só com o inventário `OPEN`/`COUNTING` — o
 * backend recusa com `INVENTORY_NOT_OPEN` (409) fora desses estados.
 * Recontagem é permitida: chamar de novo sobrescreve o valor anterior.
 */
export function countItem(
  inventoryId: string,
  itemId: string,
  countedQty: string,
): Promise<InventoryItem> {
  return request<InventoryItem>(`/inventories/${inventoryId}/items/${itemId}/count`, {
    method: 'PATCH',
    body: JSON.stringify({ countedQty }),
  });
}

/** `POST /inventories/:id/submit`. A/M/O. */
export function submitInventory(id: string): Promise<Inventory> {
  return request<Inventory>(`/inventories/${id}/submit`, { method: 'POST' });
}

/**
 * `POST /inventories/:id/approve`. ADMIN/MANAGER. O delta aplicado é
 * inteiramente calculado e aplicado pelo backend, numa transação — o
 * cliente nunca soma nem decide o saldo final, só lê o resultado.
 */
export function approveInventory(id: string): Promise<InventoryApprovalResult> {
  return request<InventoryApprovalResult>(`/inventories/${id}/approve`, { method: 'POST' });
}

/** `POST /inventories/:id/cancel`. ADMIN/MANAGER. O histórico de contagem é preservado. */
export function cancelInventory(id: string): Promise<Inventory> {
  return request<Inventory>(`/inventories/${id}/cancel`, { method: 'POST' });
}
