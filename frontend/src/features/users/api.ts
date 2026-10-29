import { request } from '@/lib/api-client';
import { buildPageParams, type Page } from '@/lib/pagination';
import type { ListParams } from '@/lib/query-keys';
import type { UserRole } from '@/types/auth';

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface UserListParams extends ListParams {
  role?: UserRole;
  isActive?: boolean;
}

export interface CreateUserInput {
  name: string;
  email: string;
  password: string;
  role: UserRole;
}

/**
 * Espelha `UpdateUserDto` — `PickType`, não `PartialType`, de propósito: só
 * nome e e-mail. Papel e senha têm endpoints próprios e auditados à parte
 * (backend/src/users/dto/user.dto.ts).
 */
export interface UpdateUserInput {
  name: string;
  email: string;
}

/** `GET /users`. ADMIN/MANAGER. */
export function listUsers(params: UserListParams): Promise<Page<User>> {
  return request<Page<User>>(`/users${buildPageParams(params)}`);
}

/** `GET /users/:id`. ADMIN/MANAGER. */
export function getUser(id: string): Promise<User> {
  return request<User>(`/users/${id}`);
}

/** `POST /users`. ADMIN apenas. */
export function createUser(input: CreateUserInput): Promise<User> {
  return request<User>('/users', { method: 'POST', body: JSON.stringify(input) });
}

/** `PATCH /users/:id`. ADMIN apenas. */
export function updateUser(id: string, input: UpdateUserInput): Promise<User> {
  return request<User>(`/users/${id}`, { method: 'PATCH', body: JSON.stringify(input) });
}

/** `PATCH /users/:id/role`. ADMIN apenas. */
export function changeUserRole(id: string, role: UserRole): Promise<User> {
  return request<User>(`/users/${id}/role`, { method: 'PATCH', body: JSON.stringify({ role }) });
}

/** `PATCH /users/:id/status`. ADMIN apenas. */
export function changeUserStatus(id: string, isActive: boolean): Promise<User> {
  return request<User>(`/users/${id}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ isActive }),
  });
}
