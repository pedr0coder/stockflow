import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/test/render';
import { ProductEditPage } from './ProductEditPage';

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

function mockApi(): void {
  vi.mocked(fetch).mockImplementation((input, init) => {
    const url = input as string;
    const emptyMeta = {
      page: 1,
      limit: 100,
      total: 0,
      totalPages: 0,
      hasNext: false,
      hasPrev: false,
    };

    if (url.includes('/categories')) {
      return Promise.resolve(
        jsonResponse(200, { data: [CATEGORIA], meta: { ...emptyMeta, total: 1, totalPages: 1 } }),
      );
    }
    if (url.includes('/suppliers')) {
      return Promise.resolve(jsonResponse(200, { data: [], meta: emptyMeta }));
    }
    if (url.endsWith('/products/p1') && (init?.method ?? 'GET') === 'GET') {
      return Promise.resolve(jsonResponse(200, PRODUTO));
    }
    if (url.endsWith('/products/p1') && init?.method === 'PATCH') {
      return Promise.resolve(jsonResponse(200, { ...PRODUTO, name: 'Chave Phillips' }));
    }
    throw new Error(`URL inesperada: ${url} ${init?.method ?? 'GET'}`);
  });
}

function renderPage() {
  return renderWithProviders(
    <Routes>
      <Route path="/products/:id/edit" element={<ProductEditPage />} />
    </Routes>,
    { route: '/products/p1/edit' },
  );
}

describe('ProductEditPage', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('não existe nenhum campo de estoque atual no formulário de edição', async () => {
    mockApi();
    renderPage();

    await screen.findByDisplayValue('Chave de fenda');

    // Nem por rótulo, nem por valor: `currentStock` não está em lugar nenhum
    // da tela, porque `ProductFormValues` não declara o campo.
    expect(screen.queryByLabelText(/estoque atual/i)).not.toBeInTheDocument();
    expect(screen.queryByDisplayValue('42.500')).not.toBeInTheDocument();
    expect(screen.queryByText('42.500')).not.toBeInTheDocument();
  });

  it('o SKU aparece mas não é editável (identidade do produto)', async () => {
    mockApi();
    renderPage();

    await screen.findByDisplayValue('FER-0001');

    expect(screen.getByDisplayValue('FER-0001')).toBeDisabled();
  });

  it('salvar edição nunca inclui currentStock no corpo do PATCH', async () => {
    mockApi();
    const user = userEvent.setup();
    renderPage();

    await screen.findByDisplayValue('Chave de fenda');

    const nameInput = screen.getByDisplayValue('Chave de fenda');
    await user.clear(nameInput);
    await user.type(nameInput, 'Chave Phillips');
    await user.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() => {
      const patchCall = vi
        .mocked(fetch)
        .mock.calls.find(
          (call) => (call[0] as string).endsWith('/products/p1') && call[1]?.method === 'PATCH',
        );
      expect(patchCall).toBeDefined();
    });

    const patchCall = vi
      .mocked(fetch)
      .mock.calls.find(
        (call) => (call[0] as string).endsWith('/products/p1') && call[1]?.method === 'PATCH',
      );
    const body = JSON.parse(patchCall?.[1]?.body as string) as Record<string, unknown>;

    expect(body).not.toHaveProperty('currentStock');
    expect(Object.keys(body).sort()).toEqual(
      ['categoryId', 'description', 'minStock', 'name', 'supplierId', 'unit', 'unitCost'].sort(),
    );
  });
});
