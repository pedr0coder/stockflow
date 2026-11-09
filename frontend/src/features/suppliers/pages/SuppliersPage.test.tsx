import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/test/render';
import { SuppliersPage } from './SuppliersPage';

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

const FORNECEDOR = {
  id: 's1',
  name: 'Distribuidora Norte',
  taxId: '11.111.111/0001-11',
  email: 'contato@norte.invalid',
  phone: '(11) 4000-0000',
  notes: null,
  isActive: true,
  createdAt: '2026-01-05T00:00:00.000Z',
  updatedAt: '2026-01-05T00:00:00.000Z',
};

/**
 * A tabela ganhou `renderCard` nesta revisão: em jsdom (que não avalia
 * `sm:hidden`), tabela e card do mesmo registro coexistem no DOM — só o CSS
 * decide qual aparece num navegador real. Asserções de conteúdo ficam
 * escopadas à tabela.
 */
async function findTable() {
  // Nome exato: o `DataTableSkeleton` usa "Carregando <legenda>" como nome
  // acessível — sem o nome exato, `findByRole` resolveria no esqueleto
  // (presente desde o primeiro render) em vez de esperar o dado real.
  return within(await screen.findByRole('table', { name: 'Lista de fornecedores' }));
}

describe('SuppliersPage', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('mostra os fornecedores reais vindos da API na tabela e nos cards mobile', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(200, page([FORNECEDOR])));

    renderWithProviders(<SuppliersPage />);

    const table = await findTable();
    expect(table.getByText('Distribuidora Norte')).toBeInTheDocument();
    expect(table.getByText('11.111.111/0001-11')).toBeInTheDocument();

    const cards = within(screen.getByRole('list'));
    expect(cards.getByText('Distribuidora Norte')).toBeInTheDocument();
    expect(cards.getByRole('button', { name: /inativar/i })).toBeInTheDocument();
  });

  it('estado vazio quando não há fornecedor cadastrado', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(200, page([])));

    renderWithProviders(<SuppliersPage />);

    expect(await screen.findByText('Nenhum fornecedor cadastrado')).toBeInTheDocument();
  });

  it('busca textual envia o parâmetro search, com atraso (debounce)', async () => {
    const user = userEvent.setup();
    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse(200, page([FORNECEDOR])))
      .mockResolvedValueOnce(jsonResponse(200, page([])));

    renderWithProviders(<SuppliersPage />);
    await findTable();

    await user.type(screen.getByRole('textbox', { name: /buscar fornecedor/i }), 'norte');

    // Antes do debounce estourar, nenhuma segunda chamada ainda.
    expect(fetch).toHaveBeenCalledTimes(1);

    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2), { timeout: 1000 });
    const secondCall = vi.mocked(fetch).mock.calls[1]?.[0] as string;
    expect(secondCall).toContain('search=norte');
  });

  it('OPERATOR não vê ações de criar ou inativar', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(200, page([FORNECEDOR])));

    renderWithProviders(<SuppliersPage />, {
      user: { id: 'u2', name: 'Op', email: 'op@x.com', role: 'OPERATOR' },
    });
    await findTable();

    expect(screen.queryByRole('link', { name: /novo fornecedor/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /inativar/i })).not.toBeInTheDocument();
  });

  it('erro de rede mostra o estado de erro da tabela, com nova tentativa', async () => {
    const user = userEvent.setup();
    vi.mocked(fetch)
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(jsonResponse(200, page([FORNECEDOR])));

    renderWithProviders(<SuppliersPage />);

    expect(await screen.findByText('Não foi possível carregar os dados.')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /tentar novamente/i }));

    const table = await findTable();
    expect(table.getByText('Distribuidora Norte')).toBeInTheDocument();
  });
});
