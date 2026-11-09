import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/test/render';
import { ProductDetailPage } from './ProductDetailPage';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const PRODUTO = {
  id: 'p1',
  sku: 'FER-0001',
  name: 'Chave de fenda',
  description: null,
  categoryId: 'c1',
  supplierId: null,
  unit: 'UN',
  currentStock: '42.500',
  minStock: '5.000',
  unitCost: '9.9900',
  isActive: true,
  createdAt: '2026-01-05T00:00:00.000Z',
  updatedAt: '2026-01-05T00:00:00.000Z',
};

const CATEGORIA = {
  id: 'c1',
  name: 'Ferramentas',
  description: null,
  isActive: true,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const MOVIMENTO = {
  id: 'm1',
  productId: 'p1',
  type: 'IN',
  reason: 'PURCHASE',
  quantity: '10.000',
  stockBefore: '32.500',
  stockAfter: '42.500',
  note: null,
  referenceDoc: null,
  inventoryItemId: null,
  user: { id: 'u1', name: 'Carla Operadora' },
  createdAt: '2026-01-10T14:30:00.000Z',
};

function mockApi(): void {
  vi.mocked(fetch).mockImplementation((input) => {
    const url = input as string;
    const emptyMeta = {
      page: 1,
      limit: 20,
      total: 0,
      totalPages: 0,
      hasNext: false,
      hasPrev: false,
    };

    if (url.includes('/categories/c1')) {
      return Promise.resolve(jsonResponse(200, CATEGORIA));
    }
    if (url.includes('/products/p1/movements')) {
      return Promise.resolve(
        jsonResponse(200, { data: [MOVIMENTO], meta: { ...emptyMeta, total: 1, totalPages: 1 } }),
      );
    }
    if (url.endsWith('/products/p1')) {
      return Promise.resolve(jsonResponse(200, PRODUTO));
    }
    throw new Error(`URL inesperada: ${url}`);
  });
}

function renderPage() {
  return renderWithProviders(
    <Routes>
      <Route path="/products/:id" element={<ProductDetailPage />} />
    </Routes>,
    { route: '/products/p1' },
  );
}

describe('ProductDetailPage', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('aba Dados mostra saldo, estoque mínimo e custo formatados em pt-BR', async () => {
    mockApi();
    renderPage();

    expect(await screen.findByText('42,500')).toBeInTheDocument();
    expect(screen.getByText('5,000')).toBeInTheDocument();
    expect(screen.getByText('R$ 9,9900')).toBeInTheDocument();
    expect(await screen.findByText('Ferramentas')).toBeInTheDocument();
  });

  it('aba Histórico mostra as movimentações reais do produto', async () => {
    mockApi();
    const user = userEvent.setup();
    renderPage();

    await screen.findByText('42,500');
    await user.click(screen.getByRole('tab', { name: 'Histórico' }));

    const table = within(
      await screen.findByRole('table', { name: 'Histórico de movimentações de Chave de fenda' }),
    );
    expect(table.getByText('Entrada')).toBeInTheDocument();
    // O motivo é traduzido, não o código cru (Marco 6C: REASON_LABEL,
    // reaproveitado aqui do mesmo mapa que a tela de movimentações usa).
    expect(table.getByText('Compra')).toBeInTheDocument();
    expect(table.getByText('Carla Operadora')).toBeInTheDocument();

    const [, cardList] = screen.getAllByRole('list');
    expect(within(cardList!).getByText('Entrada')).toBeInTheDocument();
    expect(within(cardList!).getByText('Compra')).toBeInTheDocument();
  });

  it('OPERATOR não vê os botões de editar ou inativar', async () => {
    mockApi();
    renderWithProviders(
      <Routes>
        <Route path="/products/:id" element={<ProductDetailPage />} />
      </Routes>,
      {
        route: '/products/p1',
        user: { id: 'u2', name: 'Op', email: 'op@x.com', role: 'OPERATOR' },
      },
    );

    await screen.findByText('42,500');

    expect(screen.queryByRole('link', { name: 'Editar' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /inativar/i })).not.toBeInTheDocument();
  });
});
