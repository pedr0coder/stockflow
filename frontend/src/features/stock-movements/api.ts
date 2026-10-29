import { request } from '@/lib/api-client';
import { buildPageParams, type Page } from '@/lib/pagination';
import type { ListParams } from '@/lib/query-keys';
import type { ProductMovement } from '@/features/products/api';

/** A mesma forma de `MovementDto` que `features/products/api.ts` já declara. */
export type Movement = ProductMovement;

/** Espelha `MovementType` (backend/src/generated/prisma/enums.ts). */
export const MOVEMENT_TYPES = ['IN', 'OUT', 'ADJUSTMENT'] as const;
export type MovementTypeValue = (typeof MOVEMENT_TYPES)[number];

/** Espelha `MovementReason`. */
export const MOVEMENT_REASONS = [
  'PURCHASE',
  'RETURN_IN',
  'PRODUCTION_IN',
  'TRANSFER_IN',
  'SALE',
  'CONSUMPTION',
  'LOSS',
  'EXPIRY',
  'TRANSFER_OUT',
  'CORRECTION',
  'INVENTORY_ADJUSTMENT',
] as const;
export type MovementReasonValue = (typeof MOVEMENT_REASONS)[number];

export const REASON_LABEL: Readonly<Record<MovementReasonValue, string>> = {
  PURCHASE: 'Compra',
  RETURN_IN: 'Devolução de cliente',
  PRODUCTION_IN: 'Produção interna',
  TRANSFER_IN: 'Transferência recebida',
  SALE: 'Venda',
  CONSUMPTION: 'Consumo interno',
  LOSS: 'Perda',
  EXPIRY: 'Vencimento',
  TRANSFER_OUT: 'Transferência enviada',
  CORRECTION: 'Correção manual',
  INVENTORY_ADJUSTMENT: 'Ajuste de inventário',
};

/**
 * Motivos válidos por tipo, espelhando `common/utils/movement-rules.ts` —
 * aplicado aqui só para a tela reagir sem round-trip; quem decide de fato é o
 * backend, que devolve `INVALID_TYPE_REASON` (422) para qualquer combinação
 * fora desta tabela. `INVENTORY_ADJUSTMENT` nunca aparece como opção: é
 * reservado para a aprovação de inventário, não para lançamento manual.
 */
export const REASONS_BY_TYPE: Readonly<Record<MovementTypeValue, readonly MovementReasonValue[]>> =
  {
    IN: ['PURCHASE', 'RETURN_IN', 'PRODUCTION_IN', 'TRANSFER_IN'],
    OUT: ['SALE', 'CONSUMPTION', 'LOSS', 'EXPIRY', 'TRANSFER_OUT'],
    ADJUSTMENT: ['CORRECTION'],
  };

export interface MovementListParams extends ListParams {
  productId?: string;
  type?: MovementTypeValue;
  reason?: MovementReasonValue;
  userId?: string;
  dateFrom?: string;
  dateTo?: string;
}

export interface MovementInput {
  productId: string;
  quantity: string;
  reason: MovementReasonValue;
  referenceDoc?: string;
  note?: string;
}

export interface AdjustmentInput {
  productId: string;
  finalQuantity: string;
  reason: 'CORRECTION';
  referenceDoc?: string;
  note: string;
}

/** `GET /stock-movements`. */
export function listMovements(params: MovementListParams): Promise<Page<Movement>> {
  return request<Page<Movement>>(`/stock-movements${buildPageParams(params)}`);
}

/** `GET /stock-movements/:id`. */
export function getMovement(id: string): Promise<Movement> {
  return request<Movement>(`/stock-movements/${id}`);
}

/** `POST /stock-movements/in`. A/M/O. */
export function createInMovement(input: MovementInput): Promise<Movement> {
  return request<Movement>('/stock-movements/in', { method: 'POST', body: JSON.stringify(input) });
}

/** `POST /stock-movements/out`. A/M/O. */
export function createOutMovement(input: MovementInput): Promise<Movement> {
  return request<Movement>('/stock-movements/out', { method: 'POST', body: JSON.stringify(input) });
}

/** `POST /stock-movements/adjustment`. ADMIN/MANAGER apenas. */
export function createAdjustment(input: AdjustmentInput): Promise<Movement> {
  return request<Movement>('/stock-movements/adjustment', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}
