import { escapeLikeWildcards } from './like';

/**
 * Normaliza o termo de busca vindo da query string.
 *
 * Devolve `undefined` quando não há busca a aplicar, para que o `where` saia
 * sem a cláusula em vez de filtrar por string vazia — que, com `contains`,
 * casaria com tudo e tornaria o filtro inútil.
 *
 * O escape dos curingas acontece aqui, em um ponto só: aplicá-lo em cada
 * service garantiria que um deles ficaria de fora, e o defeito só apareceria
 * em quem buscasse `%` naquele recurso específico. Ver `like.ts` para o que
 * está sendo escapado e por quê.
 */
export function searchTerm(raw: string | undefined): string | undefined {
  if (raw === undefined || raw.length === 0) {
    return undefined;
  }

  return escapeLikeWildcards(raw);
}
