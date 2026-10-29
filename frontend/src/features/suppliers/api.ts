import { request } from '@/lib/api-client';
import { buildPageParams, type Page } from '@/lib/pagination';
import type { ListParams } from '@/lib/query-keys';
import type { Product } from '@/features/products/api';

/** Forma exata de `SupplierDto` (backend/src/suppliers/dto/supplier.dto.ts). */
export interface Supplier {
  id: string;
  name: string;
  taxId: string | null;
  email: string | null;
  phone: string | null;
  notes: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SupplierListParams extends ListParams {
  isActive?: boolean;
}

export interface SupplierInput {
  name: string;
  taxId?: string;
  email?: string;
  phone?: string;
  notes?: string;
}

/** `GET /suppliers` — filtros e `sort` de `QuerySuppliersDto`. */
export function listSuppliers(params: SupplierListParams): Promise<Page<Supplier>> {
  return request<Page<Supplier>>(`/suppliers${buildPageParams(params)}`);
}

/** `GET /suppliers/:id`. */
export function getSupplier(id: string): Promise<Supplier> {
  return request<Supplier>(`/suppliers/${id}`);
}

/**
 * `GET /suppliers/:id/products`. Só `page`/`limit` são honrados pelo
 * backend — sem busca, ordenação ou filtro de situação neste endpoint
 * (sempre ordenado por nome do produto, confirmado no controller).
 */
export function listSupplierProducts(
  id: string,
  params: { page?: number },
): Promise<Page<Product>> {
  return request<Page<Product>>(`/suppliers/${id}/products${buildPageParams(params)}`);
}

/** `POST /suppliers`. ADMIN/MANAGER. */
export function createSupplier(input: SupplierInput): Promise<Supplier> {
  return request<Supplier>('/suppliers', { method: 'POST', body: JSON.stringify(input) });
}

/** `PATCH /suppliers/:id`. ADMIN/MANAGER. */
export function updateSupplier(id: string, input: Partial<SupplierInput>): Promise<Supplier> {
  return request<Supplier>(`/suppliers/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

/** `PATCH /suppliers/:id/status`. ADMIN/MANAGER. Sem bloqueio de produto vinculado (FK opcional, SetNull). */
export function setSupplierStatus(id: string, isActive: boolean): Promise<Supplier> {
  return request<Supplier>(`/suppliers/${id}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ isActive }),
  });
}
