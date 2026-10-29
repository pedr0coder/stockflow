/**
 * Chaves de consulta do React Query, centralizadas por domínio
 * (docs/18-plano-fase-6.md §18.8).
 *
 * Uma função por nível (lista, detalhe, sub-recurso), nunca um array montado
 * à mão em cada tela — é o que garante que invalidar pelo prefixo da lista
 * (`queryKeys.products.lists()`) alcance toda variação de filtro, e que
 * invalidar um domínio inteiro (`queryKeys.products.all`) nunca diverge entre
 * quem lê e quem invalida.
 */

export interface ListParams {
  page?: number;
  sort?: string;
  order?: 'asc' | 'desc';
  search?: string;
  [key: string]: string | number | boolean | undefined;
}

function domain(name: string) {
  return {
    all: [name] as const,
    lists: () => [name, 'list'] as const,
    list: (params: ListParams) => [name, 'list', params] as const,
    details: () => [name, 'detail'] as const,
    detail: (id: string) => [name, 'detail', id] as const,
  };
}

export const queryKeys = {
  categories: domain('categories'),
  suppliers: {
    ...domain('suppliers'),
    products: (id: string, params: ListParams) => ['suppliers', 'products', id, params] as const,
  },
  products: {
    ...domain('products'),
    movements: (id: string, params: ListParams) => ['products', 'movements', id, params] as const,
  },
  dashboard: {
    all: ['dashboard'] as const,
    summary: () => ['dashboard', 'summary'] as const,
    movementsChart: (days: number) => ['dashboard', 'movements-chart', days] as const,
    recentMovements: (limit: number) => ['dashboard', 'recent-movements', limit] as const,
  },
  stockMovements: domain('stock-movements'),
  inventories: domain('inventories'),
  reports: {
    lowStock: () => ['reports', 'low-stock'] as const,
    outOfStock: () => ['reports', 'out-of-stock'] as const,
    movements: (params: { dateFrom?: string; dateTo?: string }) =>
      ['reports', 'movements', params] as const,
    inventories: () => ['reports', 'inventories'] as const,
    divergences: () => ['reports', 'divergences'] as const,
    stockReconciliation: () => ['reports', 'stock-reconciliation'] as const,
  },
  users: domain('users'),
  audit: {
    all: ['audit'] as const,
    list: (params: ListParams) => ['audit', 'list', params] as const,
    forEntity: (entity: string, entityId: string, params: ListParams) =>
      ['audit', 'entity', entity, entityId, params] as const,
  },
};
