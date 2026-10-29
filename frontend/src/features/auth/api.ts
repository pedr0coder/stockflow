import { request, type RequestOptions } from '@/lib/api-client';
import type { AuthUser, UserRole } from '@/types/auth';

/** Forma exata de `AuthTokenResponseDto` (backend/src/auth/dto/auth-response.dto.ts). */
export interface AuthTokenResponse {
  accessToken: string;
  expiresIn: number;
  user: AuthUserResponse;
}

/** Forma exata de `AuthUserDto`. */
export interface AuthUserResponse {
  id: string;
  name: string;
  email: string;
  role: UserRole;
}

const SKIP_RETRY: RequestOptions = { skipAuthRetry: true };

/**
 * `POST /auth/login`.
 *
 * `skipAuthRetry` aqui não é sobre renovar sessão — é sobre não deixar um 401
 * de credencial errada disparar o fluxo de "sessão expirou" por engano: um
 * login que falha é um login que falha, não uma sessão que precisa de
 * renovação (não há sessão ainda).
 */
export function login(email: string, password: string): Promise<AuthTokenResponse> {
  return request<AuthTokenResponse>(
    '/auth/login',
    { method: 'POST', body: JSON.stringify({ email, password }) },
    SKIP_RETRY,
  );
}

/** `POST /auth/logout`. 204, idempotente mesmo sem cookie (o backend já trata assim). */
export function logout(): Promise<void> {
  return request<void>('/auth/logout', { method: 'POST' }, SKIP_RETRY);
}

/** `GET /auth/me`. Chamado só depois de haver um access token válido em memória. */
export function me(): Promise<AuthUserResponse> {
  return request<AuthUserResponse>('/auth/me');
}

export function toAuthUser(payload: AuthUserResponse): AuthUser {
  return { id: payload.id, name: payload.name, email: payload.email, role: payload.role };
}
