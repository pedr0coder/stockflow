/**
 * Envelope de paginação, espelhando `backend/src/common/dto/page.dto.ts`
 * (`PageDto`/`PageMetaDto`) campo a campo — `page` é 1-based, como na API.
 */
export interface PageMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

export interface Page<T> {
  data: T[];
  meta: PageMeta;
}

/**
 * Monta a query string de uma listagem paginada, pulando parâmetros ausentes.
 *
 * `page` é sempre 1-based na API e no `DataTable` (que exibe "Página N de M"
 * a partir de 1); o `pageIndex` 0-based do `@tanstack/react-table` só existe
 * dentro do componente — a conversão (`pageIndex + 1`) acontece na borda,
 * aqui, não se espalha pelas telas.
 */
export function buildPageParams(
  params: Readonly<Record<string, string | number | boolean | undefined>>,
): string {
  const search = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) {
      search.set(key, String(value));
    }
  }

  const query = search.toString();

  return query.length > 0 ? `?${query}` : '';
}
