import { AsyncLocalStorage } from 'node:async_hooks';
import type { UserRole } from '../generated/prisma/enums';

/**
 * Contexto da requisição disponível para a auditoria.
 *
 * O log precisa de IP, user-agent e autor. Esses três vivem na requisição
 * HTTP, e os services **não conhecem HTTP** por decisão de arquitetura
 * (docs/02-arquitetura.md §2.3): um service recebe dados, não um `Request`.
 *
 * Passar o contexto por parâmetro em toda assinatura resolveria, ao custo de
 * poluir a interface de cada método com algo que não é do domínio dele. O
 * `AsyncLocalStorage` resolve sem isso: o interceptor abre o escopo na borda
 * HTTP, e o `AuditService` lê de dentro, em qualquer profundidade da pilha,
 * sem que nada no caminho precise carregar o valor.
 *
 * É a mesma ideia de um contexto de requisição por thread, mas em Node.
 */
export interface AuditContext {
  actorId?: string | undefined;
  actorRole?: UserRole | undefined;
  /** Preservado mesmo quando não há usuário: login falho precisa do e-mail. */
  actorEmail?: string | undefined;
  ip?: string | undefined;
  userAgent?: string | undefined;
}

export const auditContextStorage = new AsyncLocalStorage<AuditContext>();

/** Contexto da requisição atual, ou vazio quando não há nenhuma. */
export function currentAuditContext(): AuditContext {
  return auditContextStorage.getStore() ?? {};
}
