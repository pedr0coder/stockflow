import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/test/render';
import { InventoriesPage } from './InventoriesPage';

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

const INVENTARIO = {
  id: 'inv1',
  code: 'INV-2026-0001',
  status: 'OPEN',
  note: null,
  startedAt: '2026-01-10T00:00:00.000Z',
  closedAt: null,
  createdBy: { id: 'u1', name: 'Ana' },
  approvedBy: null,
  approvedAt: null,
};

describe('InventoriesPage', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('mostra os inventários reais com situação traduzida', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(200, page([INVENTARIO])));

    renderWithProviders(<InventoriesPage />);

    expect(await screen.findByText('INV-2026-0001')).toBeInTheDocument();
    expect(screen.getByText('Aberto')).toBeInTheDocument();
  });

  it('estado vazio quando não há inventário', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(200, page([])));

    renderWithProviders(<InventoriesPage />);

    expect(await screen.findByText('Nenhum inventário aberto')).toBeInTheDocument();
  });

  it('filtrar por situação envia o parâmetro status', async () => {
    const user = userEvent.setup();
    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse(200, page([INVENTARIO])))
      .mockResolvedValueOnce(jsonResponse(200, page([])));

    renderWithProviders(<InventoriesPage />);
    await screen.findByText('INV-2026-0001');

    await user.click(screen.getByRole('combobox'));
    await user.click(await screen.findByRole('option', { name: 'Aprovado' }));

    await waitFor(() => {
      const call = vi
        .mocked(fetch)
        .mock.calls.map((c) => c[0] as string)
        .find((url) => url.includes('status=APPROVED'));
      expect(call).toBeDefined();
    });
  });

  it('OPERATOR não vê o botão de novo inventário', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(200, page([INVENTARIO])));

    renderWithProviders(<InventoriesPage />, {
      user: { id: 'u2', name: 'Op', email: 'op@x.com', role: 'OPERATOR' },
    });
    await screen.findByText('INV-2026-0001');

    expect(screen.queryByRole('link', { name: /novo inventário/i })).not.toBeInTheDocument();
  });
});
