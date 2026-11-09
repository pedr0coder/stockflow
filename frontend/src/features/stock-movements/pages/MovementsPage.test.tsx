import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/test/render';
import { MovementsPage } from './MovementsPage';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function page(data: unknown[]) {
  return {
    data,
    meta: { page: 1, limit: 20, total: data.length, totalPages: 1, hasNext: false, hasPrev: false },
  };
}

const MOVIMENTO = {
  id: 'm1',
  productId: 'p1',
  type: 'IN',
  reason: 'PURCHASE',
  quantity: '10.000',
  stockBefore: '0.000',
  stockAfter: '15.500',
  note: null,
  referenceDoc: null,
  inventoryItemId: null,
  user: { id: 'u1', name: 'Carla Operadora' },
  createdAt: '2026-01-10T14:30:00.000Z',
};

/**
 * `ProductPicker` (usado no filtro por produto) busca `/products` assim que
 * monta, em paralelo com `/stock-movements` — por URL, não por ordem de
 * chamada, pelo mesmo motivo do Marco 6B (categorias/fornecedores em
 * paralelo nas listas de produto).
 */
function mockApi(movementsResponse: unknown): void {
  vi.mocked(fetch).mockImplementation((input) => {
    const url = input as string;

    if (url.includes('/products')) {
      return Promise.resolve(jsonResponse(200, page([])));
    }

    if (url.includes('/stock-movements')) {
      return Promise.resolve(jsonResponse(200, movementsResponse));
    }

    throw new Error(`URL inesperada no teste: ${url}`);
  });
}

async function findTable() {
  return within(await screen.findByRole('table', { name: 'Histórico de movimentações' }));
}

describe('MovementsPage', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('mostra o histórico real, com tipo e motivo traduzidos na tabela e nos cards mobile', async () => {
    mockApi(page([MOVIMENTO]));

    renderWithProviders(<MovementsPage />);

    const table = await findTable();
    expect(table.getByText('Entrada')).toBeInTheDocument();
    expect(table.getByText('Compra')).toBeInTheDocument();
    expect(table.getByText('10,000')).toBeInTheDocument();

    const cards = within(screen.getByRole('list'));
    expect(cards.getByText('Entrada')).toBeInTheDocument();
    expect(cards.getByText('Compra')).toBeInTheDocument();
    expect(cards.getByRole('link', { name: 'Ver produto' })).toBeInTheDocument();
  });

  it('estado vazio quando não há movimentação', async () => {
    mockApi(page([]));

    renderWithProviders(<MovementsPage />);

    expect(await screen.findByText('Nenhuma movimentação registrada')).toBeInTheDocument();
  });

  it('filtrar por tipo envia o parâmetro type e reinicia a página', async () => {
    const user = userEvent.setup();
    mockApi(page([MOVIMENTO]));

    renderWithProviders(<MovementsPage />);
    await findTable();

    const typeSelects = screen.getAllByRole('combobox');
    await user.click(typeSelects[1]!); // produto é o primeiro combobox; tipo é o segundo
    await user.click(await screen.findByRole('option', { name: 'Saída' }));

    await waitFor(() => {
      const call = vi
        .mocked(fetch)
        .mock.calls.map((c) => c[0] as string)
        .find((url) => url.includes('/stock-movements') && url.includes('type=OUT'));
      expect(call).toBeDefined();
      expect(call).toContain('page=1');
    });
  });

  it('OPERATOR não vê a opção "Ajuste" no filtro de tipo', async () => {
    mockApi(page([MOVIMENTO]));

    renderWithProviders(<MovementsPage />, {
      user: { id: 'u2', name: 'Op', email: 'op@x.com', role: 'OPERATOR' },
    });
    await findTable();

    const user = userEvent.setup();
    const combos = screen.getAllByRole('combobox');
    await user.click(combos[1]!);

    expect(screen.queryByRole('option', { name: 'Ajuste' })).not.toBeInTheDocument();
  });
});
