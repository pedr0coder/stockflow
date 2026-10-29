import { request } from '@/lib/api-client';
import { buildPageParams, type Page } from '@/lib/pagination';
import type { ListParams } from '@/lib/query-keys';

/**
 * Nenhuma rota de escrita existe para auditoria (confirmado no controller) —
 * é só leitura, por desenho: o registro não pode ser alterado pela
 * interface porque não há endpoint para isso.
 */
export interface AuditLog {
  id: string;
  userId: string | null;
  actorEmail: string | null;
  action: string;
  entity: string | null;
  entityId: string | null;
  before: unknown;
  after: unknown;
  ip: string | null;
  userAgent: string | null;
  createdAt: string;
}

export interface AuditListParams extends ListParams {
  action?: string;
  entity?: string;
  userId?: string;
}

/** `GET /audit`. ADMIN apenas. */
export function listAudit(params: AuditListParams): Promise<Page<AuditLog>> {
  return request<Page<AuditLog>>(`/audit${buildPageParams(params)}`);
}

/** `GET /audit/:entity/:entityId`. ADMIN/MANAGER. */
export function listAuditForEntity(
  entity: string,
  entityId: string,
  params: ListParams,
): Promise<Page<AuditLog>> {
  return request<Page<AuditLog>>(`/audit/${entity}/${entityId}${buildPageParams(params)}`);
}
