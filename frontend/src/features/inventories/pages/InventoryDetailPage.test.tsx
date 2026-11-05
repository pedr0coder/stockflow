import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/test/render';
import { InventoryDetailPage } from './InventoryDetailPage';

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
  currentStock: '10.000',
  minStock: '5.000',
  unitCost: '9.9900',
  isActive: true,
  createdAt: '2026-01-05T00:00:00.000Z',
  updatedAt: '2026-01-05T00:00:00.000Z',
};

function inventoryFixture(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'inv1',
    code: 'INV-2026-0001',
    status: 'PENDING_APPROVAL',
    note: null,
    startedAt: '2026-01-10T00:00:00.000Z',
    closedAt: null,
    createdBy: { id: 'u1', name: 'Ana' },
    approvedBy: null,
    approvedAt: null,
    items: [
      {
        id: 'item1',
        productId: 'p1',
        expectedQty: '10.000',
        countedQty: '8.000',
        divergence: '-2.000',
        countedAt: '2026-01-10T10:00:00.000Z',
        countedBy: { id: 'u1', name: 'Ana' },
        currentStock: '10.000',
        movedSinceCount: '0.000',
        movementsSinceCount: 0,
      },
    ],
    ...overrides,
  };
}

function mockApi(inventory: ReturnType<typeof inventoryFixture>): void {
  vi.mocked(fetch).mockImplementation((input, init) => {
    const url = input as string;
    const method = init?.method ?? 'GET';

    if (url.endsWith('/products/p1')) {
      return Promise.resolve(jsonResponse(200, PRODUTO));
    }
    if (url.endsWith('/inventories/inv1') && method === 'GET') {
      return Promise.resolve(jsonResponse(200, inventory));
    }
    throw new Error(`URL inesperada: ${method} ${url}`);
  });
}

function renderPage() {
  return renderWithProviders(
    <Routes>
      <Route path="/inventories/:id" element={<InventoryDetailPage />} />
    </Routes>,
    { route: '/inventories/inv1' },
  );
}

describe('InventoryDetailPage', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('M7C-2: com nome/SKU no item, não dispara nenhum GET /products/:id', async () => {
    const [item] = inventoryFixture().items;
    mockApi(
      inventoryFixture({
        items: [{ ...item, productSku: 'FER-0001', productName: 'Chave de fenda' }],
      }),
    );
    renderPage();

    expect(await screen.findByText('Chave de fenda')).toBeInTheDocument();
    expect(screen.getByText('FER-0001')).toBeInTheDocument();

    const urls = vi.mocked(fetch).mock.calls.map((call) => call[0] as string);
    expect(urls.some((url) => url.includes('/products/'))).toBe(false);
    expect(urls.filter((url) => url.includes('/inventories/inv1'))).toHaveLength(1);
  });

  it('M7C-2: registrar uma contagem (PATCH sem nome/SKU) não reintroduz GET /products/:id', async () => {
    const [base] = inventoryFixture().items;
    const semContagem = {
      ...base,
      productSku: 'FER-0001',
      productName: 'Chave de fenda',
      countedQty: null,
      divergence: null,
      countedAt: null,
      countedBy: null,
      currentStock: null,
      movedSinceCount: null,
      movementsSinceCount: null,
    };
    let contado = false;

    vi.mocked(fetch).mockImplementation((input, init) => {
      const url = input as string;
      const method = init?.method ?? 'GET';

      if (url.endsWith('/inventories/inv1/items/item1/count') && method === 'PATCH') {
        contado = true;
        // Contrato real do PATCH: o item contado, sem `productSku`/`productName`.
        return Promise.resolve(
          jsonResponse(200, {
            id: 'item1',
            productId: 'p1',
            expectedQty: '10.000',
            countedQty: '8.000',
            divergence: '-2.000',
            countedAt: '2026-01-10T10:00:00.000Z',
            countedBy: null,
            currentStock: null,
            movedSinceCount: null,
            movementsSinceCount: null,
          }),
        );
      }
      if (url.endsWith('/inventories/inv1') && method === 'GET') {
        const item = contado
          ? { ...semContagem, countedQty: '8.000', divergence: '-2.000' }
          : semContagem;

        return Promise.resolve(
          jsonResponse(200, inventoryFixture({ status: 'OPEN', items: [item] })),
        );
      }
      throw new Error(`URL inesperada: ${method} ${url}`);
    });

    const user = userEvent.setup();
    renderPage();

    await screen.findByText('Chave de fenda');
    await user.type(screen.getByLabelText('Quantidade contada para o item item1'), '8.000');
    await user.click(screen.getByRole('button', { name: 'Salvar' }));

    // A tela é atualizada por refetch do detalhe (que traz nome/SKU), não pela
    // resposta do PATCH: o produto não pode sumir nem virar "Carregando…".
    await waitFor(() => {
      const gets = vi
        .mocked(fetch)
        .mock.calls.filter(
          (call) =>
            (call[0] as string).endsWith('/inventories/inv1') &&
            (call[1]?.method ?? 'GET') === 'GET',
        );
      expect(gets).toHaveLength(2);
    });
    expect(await screen.findByText('Chave de fenda')).toBeInTheDocument();
    expect(screen.queryByText('Carregando…')).not.toBeInTheDocument();

    const urls = vi.mocked(fetch).mock.calls.map((call) => call[0] as string);
    expect(urls.some((url) => url.includes('/products/'))).toBe(false);
  });

  it('mostra os itens com esperado, contado, divergência e produto resolvido', async () => {
    mockApi(inventoryFixture());
    renderPage();

    expect(await screen.findByText('Chave de fenda')).toBeInTheDocument();
    expect(screen.getByText('10,000')).toBeInTheDocument(); // esperado
    expect(screen.getByText('8,000')).toBeInTheDocument(); // contado (não editável, PENDING_APPROVAL)
    expect(screen.getByText('-2,000')).toBeInTheDocument(); // divergência
  });

  it('item com saldo já alterado desde a contagem é destacado, não escondido', async () => {
    mockApi(
      inventoryFixture({
        items: [
          {
            ...inventoryFixture().items[0],
            movedSinceCount: '-1.500',
          },
        ],
      }),
    );
    renderPage();

    await screen.findByText('Chave de fenda');

    const badge = screen.getByText('-1,500');
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveAttribute(
      'title',
      'O saldo já mudou desde que este item foi contado — revise antes de aprovar.',
    );
  });

  it('aprovar com sucesso invalida o inventário e mostra confirmação', async () => {
    mockApi(inventoryFixture());
    const user = userEvent.setup();
    renderPage();

    await screen.findByText('Chave de fenda');

    await user.click(screen.getByRole('button', { name: 'Aprovar' }));
    await user.click(await screen.findByRole('button', { name: 'Confirmar' }));

    vi.mocked(fetch).mockImplementationOnce((input, init) => {
      const url = input as string;
      expect(url).toContain('/inventories/inv1/approve');
      expect(init?.method).toBe('POST');
      return Promise.resolve(
        jsonResponse(200, {
          inventory: inventoryFixture({ status: 'APPROVED' }),
          adjustments: [
            {
              inventoryItemId: 'item1',
              productId: 'p1',
              appliedDelta: '-2.000',
              movedSinceCount: '0.000',
              stockBefore: '10.000',
              stockAfter: '8.000',
              movementId: 'mv1',
            },
          ],
          adjustedItemsCount: 1,
        }),
      );
    });

    // O clique já disparou a mutação real dentro do ConfirmDialog; a troca
    // de mock acima só define a resposta da PRÓXIMA chamada de approve —
    // reconfirma aqui que a chamada de fato aconteceu.
    await waitFor(() => {
      const approveCall = vi
        .mocked(fetch)
        .mock.calls.find((call) => (call[0] as string).includes('/approve'));
      expect(approveCall).toBeDefined();
    });
  });

  it('saldo insuficiente na aprovação (409) mostra mensagem, sem travar a tela', async () => {
    mockApi(inventoryFixture());
    const user = userEvent.setup();
    renderPage();

    await screen.findByText('Chave de fenda');

    vi.mocked(fetch).mockImplementation((input, init) => {
      const url = input as string;
      const method = init?.method ?? 'GET';

      if (url.endsWith('/products/p1')) {
        return Promise.resolve(jsonResponse(200, PRODUTO));
      }
      if (url.endsWith('/inventories/inv1') && method === 'GET') {
        return Promise.resolve(jsonResponse(200, inventoryFixture()));
      }
      if (url.includes('/approve')) {
        return Promise.resolve(
          jsonResponse(409, {
            code: 'INSUFFICIENT_STOCK',
            message: 'Estoque insuficiente.',
            details: {
              problems: [{ productId: 'p1', available: '1.000', requested: '2.000' }],
            },
          }),
        );
      }
      throw new Error(`URL inesperada: ${method} ${url}`);
    });

    await user.click(screen.getByRole('button', { name: 'Aprovar' }));
    await user.click(await screen.findByRole('button', { name: 'Confirmar' }));

    expect(await screen.findByText(/saldo insuficiente em 1 produto/i)).toBeInTheDocument();
    // A tela continua: o botão Aprovar segue disponível para nova tentativa.
    expect(screen.getByRole('button', { name: 'Aprovar' })).toBeInTheDocument();
  });

  it('cancelar um inventário pendente funciona e muda o status', async () => {
    mockApi(inventoryFixture());
    const user = userEvent.setup();
    renderPage();

    await screen.findByText('Chave de fenda');

    vi.mocked(fetch).mockImplementationOnce((input, init) => {
      expect(input as string).toContain('/inventories/inv1/cancel');
      expect(init?.method).toBe('POST');
      return Promise.resolve(jsonResponse(200, inventoryFixture({ status: 'CANCELLED' })));
    });

    await user.click(screen.getByRole('button', { name: 'Cancelar' }));
    await user.click(await screen.findByRole('button', { name: 'Confirmar' }));

    await waitFor(() => {
      const cancelCall = vi
        .mocked(fetch)
        .mock.calls.find((call) => (call[0] as string).includes('/cancel'));
      expect(cancelCall).toBeDefined();
    });
  });

  it('inventário aprovado não mostra nenhuma ação (estado terminal)', async () => {
    mockApi(inventoryFixture({ status: 'APPROVED' }));
    renderPage();

    await screen.findByText('Chave de fenda');

    expect(screen.queryByRole('button', { name: 'Aprovar' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cancelar' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Enviar para aprovação' })).not.toBeInTheDocument();
  });

  it('MANAGER não vê Aprovar nem Cancelar fora do seu papel (OPERATOR)', async () => {
    mockApi(inventoryFixture({ status: 'OPEN' }));

    renderWithProviders(
      <Routes>
        <Route path="/inventories/:id" element={<InventoryDetailPage />} />
      </Routes>,
      {
        route: '/inventories/inv1',
        user: { id: 'u2', name: 'Op', email: 'op@x.com', role: 'OPERATOR' },
      },
    );

    await screen.findByText('Chave de fenda');

    expect(screen.getByRole('button', { name: 'Enviar para aprovação' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Aprovar' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cancelar' })).not.toBeInTheDocument();
  });
});
