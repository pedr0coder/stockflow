import { useQuery } from '@tanstack/react-query';
import { listAudit, listAuditForEntity, type AuditListParams } from '@/features/audit/api';
import type { ListParams } from '@/lib/query-keys';
import { queryKeys } from '@/lib/query-keys';

export function useAuditQuery(params: AuditListParams) {
  return useQuery({
    queryKey: queryKeys.audit.list(params),
    queryFn: () => listAudit(params),
  });
}

export function useAuditForEntityQuery(entity: string, entityId: string, params: ListParams) {
  return useQuery({
    queryKey: queryKeys.audit.forEntity(entity, entityId, params),
    queryFn: () => listAuditForEntity(entity, entityId, params),
    enabled: entity.length > 0 && entityId.length > 0,
  });
}
