import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/test/render';
import { ReportsPage } from './ReportsPage';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function mockApi(): void {
  vi.mocked(fetch).mockImplementation((input) => {
    const url = input as string;

    if (url.includes('/reports/low-stock')) {
      return Promise.resolve(
        jsonResponse(200, [
          {
            id: 'p1',
            sku: 'FER-0001',
            name: 'Chave de fenda',
            currentStock: '2.000',
            minStock: '5.000',
            deficit: '3.000',
          },
        ]),
      );
    }
    if (url.includes('/reports/out-of-stock')) {
      return Promise.resolve(jsonResponse(200, []));
    }
    if (url.includes('/reports/stock-reconciliation')) {
      return Promise.resolve(jsonResponse(200, []));
    }
    throw new Error(`URL inesperada: ${url}`);
  });
}

describe('ReportsPage', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('mostra o relatório de estoque baixo com dado real, por padrão', async () => {
    mockApi();

    renderWithProviders(<ReportsPage />);

    expect(await screen.findByText('Chave de fenda')).toBeInTheDocument();
    expect(screen.getByText('3,000')).toBeInTheDocument();
  });

  it('OPERATOR não vê a opção de reconciliação de estoque (ADMIN apenas)', async () => {
    mockApi();

    renderWithProviders(<ReportsPage />, {
      user: { id: 'u2', name: 'Op', email: 'op@x.com', role: 'OPERATOR' },
    });
    await screen.findByText('Chave de fenda');

    const user = userEvent.setup();
    await user.click(screen.getByRole('combobox'));

    expect(
      screen.queryByRole('option', { name: 'Reconciliação de estoque' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Divergências' })).not.toBeInTheDocument();
  });

  it('trocar para "sem estoque" mostra o estado vazio real, não um erro', async () => {
    mockApi();
    const user = userEvent.setup();

    renderWithProviders(<ReportsPage />);
    await screen.findByText('Chave de fenda');

    await user.click(screen.getByRole('combobox'));
    await user.click(await screen.findByRole('option', { name: 'Produtos sem estoque' }));

    expect(await screen.findByText('Sem dados para este relatório')).toBeInTheDocument();
  });

  it('ADMIN vê todas as seis opções de relatório', async () => {
    mockApi();

    renderWithProviders(<ReportsPage />, {
      user: { id: 'u1', name: 'Admin', email: 'admin@x.com', role: 'ADMIN' },
    });
    await screen.findByText('Chave de fenda');

    const user = userEvent.setup();
    await user.click(screen.getByRole('combobox'));

    expect(screen.getByRole('option', { name: 'Reconciliação de estoque' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Divergências' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Inventários' })).toBeInTheDocument();
  });
});
