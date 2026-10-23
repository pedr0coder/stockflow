import { Prisma } from '../../generated/prisma/client';
import { formatDecimalField } from './decimal-scale';

/**
 * Remoção de campos sensíveis antes de gravar no log de auditoria.
 *
 * O log de auditoria **nunca** grava senha, hash, token ou segredo
 * (docs/04-banco-de-dados.md §4.4). Esta função é o único ponto onde isso é
 * decidido: repetir a verificação em cada chamada garantiria que uma delas
 * ficaria desatualizada.
 *
 * A lista é explícita, e não uma heurística por substring. Uma heurística que
 * procurasse "password" dentro do nome da chave deixaria passar `pwd` e
 * redigiria `passwordPolicy` sem motivo. Nome novo de campo sensível entra
 * aqui, de propósito: é uma decisão, não um efeito colateral.
 */
const SENSITIVE_KEYS: readonly string[] = [
  'password',
  'passwordhash',
  'currentpassword',
  'newpassword',
  'token',
  'tokenhash',
  'refreshtoken',
  'accesstoken',
  'secret',
  'authorization',
  'apikey',
  'cookie',
];

/** Valor que substitui o conteúdo removido. */
export const REDACTED = '[REDIGIDO]';

/**
 * Percorre a estrutura e substitui o valor de toda chave sensível.
 *
 * Trata objeto aninhado e array, porque o estado de uma entidade pode chegar
 * aninhado. A comparação é feita em minúsculas para que `passwordHash`,
 * `PasswordHash` e `PASSWORDHASH` sejam todos reconhecidos.
 *
 * Devolve uma estrutura nova: o objeto de entrada não é alterado. Mutá-lo
 * redigiria também a entidade que o chamador está prestes a devolver na
 * resposta HTTP.
 */
export function redactSensitive(value: unknown, field?: string): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => redactSensitive(item, field));
  }

  if (value === null || typeof value !== 'object') {
    return value;
  }

  // Date é objeto, mas não é estrutura a percorrer: recriá-la campo a campo a
  // destruiria.
  if (value instanceof Date) {
    return value;
  }

  /**
   * ┌────────────────────────────────────────────────────────────────────────┐
   * │ `Decimal` precisa virar texto AQUI, e não é detalhe estético.          │
   * │                                                                        │
   * │ Sem esta linha, o `Object.entries` abaixo achatava o `Decimal` em      │
   * │ `{ constructor, s, e, d }`. O Prisma recusa gravar uma função na       │
   * │ coluna `Json`, o `record()` engole a exceção de propósito — para que   │
   * │ uma falha de log não derrube a operação já concluída — e o registro    │
   * │ de auditoria simplesmente NÃO EXISTIA. Criar e alterar produto não     │
   * │ deixavam rastro, e nada no caminho de sucesso denunciava isso.         │
   * │                                                                        │
   * │ Foi o teste de integração de catálogo que expôs a falha, pelo log de   │
   * │ erro da suíte, não por uma asserção: o caso que afirma a existência    │
   * │ do registro está em `audit.int-spec.ts`.                               │
   * │                                                                        │
   * │ A escala é a mesma da resposta HTTP, pela mesma função: um log com     │
   * │ `19.5` ao lado de uma resposta com `"19.500"` obrigaria quem           │
   * │ investiga a decidir qual dos dois é o valor real.                      │
   * └────────────────────────────────────────────────────────────────────────┘
   */
  if (Prisma.Decimal.isDecimal(value)) {
    return formatDecimalField(value, field);
  }

  const entries = Object.entries(value as Record<string, unknown>);
  const result: Record<string, unknown> = {};

  for (const [key, item] of entries) {
    result[key] = SENSITIVE_KEYS.includes(key.toLowerCase())
      ? REDACTED
      : redactSensitive(item, key);
  }

  return result;
}

/**
 * Prepara um objeto para o campo `before`/`after` do log.
 *
 * Devolve `undefined` quando não há o que gravar, para que a coluna fique nula
 * em vez de guardar um objeto vazio que não diz nada.
 */
export function toAuditSnapshot(value: unknown): Record<string, unknown> | undefined {
  if (value === null || value === undefined || typeof value !== 'object') {
    return undefined;
  }

  const redacted = redactSensitive(value);

  return typeof redacted === 'object' && redacted !== null
    ? (redacted as Record<string, unknown>)
    : undefined;
}
