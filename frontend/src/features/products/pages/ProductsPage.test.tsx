import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/test/render';
import { ProductsPage } from './ProductsPage';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function page(data: unknown[]) {
  return {
    data,
    meta: {
      page: 1,
      limit: 20,
      total: data.length,
      totalPages: Math.max(1, Math.ceil(data.length / 20)),
      hasNext: false,
      hasPrev: false,
    },
  };
}

const PRODUTO_BAIXO = {
  id: 'p1',
  sku: 'FER-0001',
  name: 'Chave de fenda',
  description: null,
  categoryId: 'c1',
  supplierId: null,
  unit: 'UN',
  currentStock: '2.000',
  minStock: '5.000',
  unitCost: '9.9900',
  isActive: true,
  createdAt: '2026-01-05T00:00:00.000Z',
  updatedAt: '2026-01-05T00:00:00.000Z',
};

/**
 * Despacha por URL, não por ordem de chamada: `ProductsPage` dispara
 * `/categories` (para o filtro) e `/products` em paralelo, e a ordem real das
 * duas chamadas não é um contrato que o teste deva travar.
 */
function mockApi(productsResponse: unknown): void {
  vi.mocked(fetch).mockImplementation((input) => {
    const url = input as string;

    if (url.includes('/categories')) {
      return Promise.resolve(
        jsonResponse(200, {
          data: [],
          meta: { page: 1, limit: 100, total: 0, totalPages: 0, hasNext: false, hasPrev: false },
        }),
      );
    }

    if (url.includes('/products')) {
      return Promise.resolve(jsonResponse(200, productsResponse));
    }

    throw new Error(`URL inesperada no teste: ${url}`);
  });
}

/**
 * A tabela (`DataTable`) ganhou `renderCard` nesta revisão (responsividade em
 * 375px): em jsdom, que não avalia `sm:hidden`/`hidden sm:block`, a tabela E
 * o card do mesmo registro existem no DOM ao mesmo tempo — só o CSS, num
 * navegador real, decide qual aparece. Por isso as asserções de conteúdo
 * aqui são escopadas à tabela, e não ao documento inteiro.
 */
async function findTable() {
  // Nome exato: o `DataTableSkeleton` usa "Carregando <legenda>" como nome
  // acessível — sem o nome exato, `findByRole` resolveria no esqueleto
  // (presente desde o primeiro render) em vez de esperar o dado real.
  return within(await screen.findByRole('table', { name: 'Lista de produtos' }));
}

describe('ProductsPage', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('mostra os produtos reais, com saldo e situação de estoque formatados na tabela e nos cards mobile', async () => {
    mockApi(page([PRODUTO_BAIXO]));

    renderWithProviders(<ProductsPage />);

    const table = await findTable();
    expect(table.getByText('Chave de fenda')).toBeInTheDocument();
    // Decimal exibido como veio da API (3 casas), nunca `Number()`.
    expect(table.getByText('2,000')).toBeInTheDocument();
    expect(table.getByText('Estoque baixo')).toBeInTheDocument();

    const cards = within(screen.getByRole('list'));
    expect(cards.getByText('Chave de fenda')).toBeInTheDocument();
    expect(cards.getByText('Ativo')).toBeInTheDocument();
    expect(cards.getByRole('link', { name: 'Editar' })).toBeInTheDocument();
    expect(cards.getByRole('button', { name: /inativar/i })).toBeInTheDocument();
  });

  it('estado vazio quando não há produto cadastrado', async () => {
    mockApi(page([]));

    renderWithProviders(<ProductsPage />);

    expect(await screen.findByText('Nenhum produto cadastrado')).toBeInTheDocument();
  });

  it('ordenar por saldo envia sort e order reais para a API', async () => {
    const user = userEvent.setup();
    mockApi(page([PRODUTO_BAIXO]));

    renderWithProviders(<ProductsPage />);
    await findTable();

    await user.click(screen.getByRole('button', { name: /saldo/i }));

    await waitFor(() => {
      const sortedCall = vi
        .mocked(fetch)
        .mock.calls.map((call) => call[0] as string)
        .find((url) => url.includes('/products') && url.includes('sort=currentStock'));
      expect(sortedCall).toBeDefined();
      expect(sortedCall).toContain('order=asc');
    });
  });

  it('busca reinicia a página e envia o parâmetro search', async () => {
    const user = userEvent.setup();
    mockApi(page([PRODUTO_BAIXO]));

    renderWithProviders(<ProductsPage />);
    await findTable();

    await user.type(screen.getByRole('textbox', { name: /buscar produto/i }), 'fenda');

    await waitFor(
      () => {
        const searchCall = vi
          .mocked(fetch)
          .mock.calls.map((call) => call[0] as string)
          .find((url) => url.includes('/products') && url.includes('search=fenda'));
        expect(searchCall).toBeDefined();
        expect(searchCall).toContain('page=1');
      },
      { timeout: 1000 },
    );
  });

  it('OPERATOR vê o produto mas não as ações de editar ou inativar', async () => {
    mockApi(page([PRODUTO_BAIXO]));

    renderWithProviders(<ProductsPage />, {
      user: { id: 'u2', name: 'Op', email: 'op@x.com', role: 'OPERATOR' },
    });
    await findTable();

    expect(screen.queryByRole('link', { name: /novo produto/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Editar' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /inativar/i })).not.toBeInTheDocument();
  });
});
