import { request } from '@/lib/api-client';
import { buildPageParams, type Page } from '@/lib/pagination';
import type { ListParams } from '@/lib/query-keys';

/** Forma exata de `CategoryDto` (backend/src/categories/dto/category.dto.ts). */
export interface Category {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CategoryListParams extends ListParams {
  isActive?: boolean;
}

export interface CategoryInput {
  name: string;
  description?: string;
}

/** `GET /categories` — filtros e `sort` de `QueryCategoriesDto`. */
export function listCategories(params: CategoryListParams): Promise<Page<Category>> {
  return request<Page<Category>>(`/categories${buildPageParams(params)}`);
}

/** `GET /categories/:id`. */
export function getCategory(id: string): Promise<Category> {
  return request<Category>(`/categories/${id}`);
}

/** `POST /categories`. ADMIN/MANAGER. */
export function createCategory(input: CategoryInput): Promise<Category> {
  return request<Category>('/categories', { method: 'POST', body: JSON.stringify(input) });
}

/** `PATCH /categories/:id`. ADMIN/MANAGER. */
export function updateCategory(id: string, input: Partial<CategoryInput>): Promise<Category> {
  return request<Category>(`/categories/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

/**
 * `PATCH /categories/:id/status`. ADMIN/MANAGER.
 *
 * Desativar uma categoria com produto ativo vinculado devolve
 * `CATEGORY_HAS_PRODUCTS` (409) — o backend recusa por `UPDATE ... WHERE NOT
 * EXISTS`, não por uma checagem prévia que poderia ter corrida.
 */
export function setCategoryStatus(id: string, isActive: boolean): Promise<Category> {
  return request<Category>(`/categories/${id}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ isActive }),
  });
}
