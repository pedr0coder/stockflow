/**
 * Escapa os curingas do `LIKE` em um termo de busca.
 *
 * ┌────────────────────────────────────────────────────────────────────────────┐
 * │ Não é injeção de SQL, e é um defeito de verdade.                           │
 * │                                                                            │
 * │ O `contains` do Prisma monta `ILIKE '%' || $1 || '%'` com o termo          │
 * │ parametrizado, então não há como escapar da string. Só que `%` e `_` são   │
 * │ curingas DENTRO do padrão, e o Prisma não os escapa:                       │
 * │                                                                            │
 * │   ?search=%   →  ILIKE '%%%'   →  casa com tudo                            │
 * │   ?search=a_c →  ILIKE '%a_c%' →  casa com "abc", "axc", "a1c"            │
 * │                                                                            │
 * │ Duas consequências. A busca mente: procurar o produto "Desconto 50%" por   │
 * │ "50%" devolve o catálogo inteiro. E o filtro deixa de ser filtro: quem     │
 * │ chama a API passa a poder ignorá-lo com um caractere.                      │
 * │                                                                            │
 * │ Foi o teste de segurança que encontrou isso, afirmando que `%` como termo  │
 * │ de busca não deveria casar com tudo.                                       │
 * │                                                                            │
 * │ A barra invertida vem primeiro na substituição, de propósito: escapá-la    │
 * │ depois duplicaria as barras que acabaram de ser inseridas.                 │
 * └────────────────────────────────────────────────────────────────────────────┘
 */
export function escapeLikeWildcards(term: string): string {
  return term.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
}
