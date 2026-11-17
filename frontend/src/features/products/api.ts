import { request } from '@/lib/api-client';
import { buildPageParams, type Page } from '@/lib/pagination';
import type { ListParams } from '@/lib/query-keys';
import type { MovementType } from '@/components/shared/MovementTypeBadge';

/** Espelha `UnitOfMeasure` (backend/src/generated/prisma/enums.ts). */
export const UNITS_OF_MEASURE = ['UN', 'KG', 'L', 'M', 'BOX', 'PACK'] as const;
export type UnitOfMeasure = (typeof UNITS_OF_MEASURE)[number];

export const UNIT_LABEL: Readonly<Record<UnitOfMeasure, string>> = {
  UN: 'Unidade',
  KG: 'Quilograma',
  L: 'Litro',
  M: 'Metro',
  BOX: 'Caixa',
  PACK: 'Pacote',
};

/** Forma exata de `ProductDto` (backend/src/products/dto/product.dto.ts). */
export interface Product {
  id: string;
  sku: string;
  name: string;
  description: string | null;
  categoryId: string;
  supplierId: string | null;
  unit: UnitOfMeasure;
  currentStock: string;
  minStock: string;
  unitCost: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export type StockStatusFilter = 'low' | 'out' | 'ok';

export interface ProductListParams extends ListParams {
  categoryId?: string;
  supplierId?: string;
  isActive?: boolean;
  stockStatus?: StockStatusFilter;
}

/**
 * Entrada de criação/edição. `currentStock` não existe aqui de propósito —
 * o backend nem aceita o campo (`UpdateProductDto` não o declara, e o
 * `ValidationPipe` roda com `forbidNonWhitelisted`): saldo só muda por
 * movimentação (Marco 6C), nunca pelo formulário de cadastro.
 */
export interface ProductInput {
  sku: string;
  name: string;
  description?: string;
  categoryId: string;
  supplierId?: string;
  unit: UnitOfMeasure;
  minStock?: string;
  unitCost?: string;
}

/** Forma de `MovementDto` (backend/src/stock-movements/dto/movement.dto.ts). */
export interface ProductMovement {
  id: string;
  productId: string;
  product?: {
    id: string;
    name: string;
    sku: string;
  };
  type: MovementType;
  reason: string;
  quantity: string;
  stockBefore: string;
  stockAfter: string;
  note: string | null;
  referenceDoc: string | null;
  inventoryItemId: string | null;
  user: { id: string; name: string };
  createdAt: string;
}

/** `GET /products` — filtros e `sort` de `QueryProductsDto`. */
export function listProducts(params: ProductListParams): Promise<Page<Product>> {
  return request<Page<Product>>(`/products${buildPageParams(params)}`);
}

/** `GET /products/:id`. */
export function getProduct(id: string): Promise<Product> {
  return request<Product>(`/products/${id}`);
}

/** `GET /products/:id/movements`. */
export function listProductMovements(
  id: string,
  params: { page?: number },
): Promise<Page<ProductMovement>> {
  return request<Page<ProductMovement>>(`/products/${id}/movements${buildPageParams(params)}`);
}

/** `POST /products`. ADMIN/MANAGER. */
export function createProduct(input: ProductInput): Promise<Product> {
  return request<Product>('/products', { method: 'POST', body: JSON.stringify(input) });
}

/** `PATCH /products/:id`. ADMIN/MANAGER. */
export function updateProduct(id: string, input: Partial<ProductInput>): Promise<Product> {
  return request<Product>(`/products/${id}`, { method: 'PATCH', body: JSON.stringify(input) });
}

/** `PATCH /products/:id/status`. ADMIN/MANAGER. */
export function setProductStatus(id: string, isActive: boolean): Promise<Product> {
  return request<Product>(`/products/${id}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ isActive }),
  });
}

/** `DELETE /products/:id` — exclusão simulada no sandbox de demonstração (Fase 9). */
export function deleteProduct(id: string): Promise<void> {
  return request<void>(`/products/${id}`, { method: 'DELETE' });
}
