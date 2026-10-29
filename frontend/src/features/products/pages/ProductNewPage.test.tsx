import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/test/render';
import { ProductNewPage } from './ProductNewPage';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const CATEGORIA = {
  id: 'c1',
  name: 'Ferramentas',
  description: null,
  isActive: true,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

function mockLookups(): void {
  vi.mocked(fetch).mockImplementation((input) => {
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

    throw new Error(`URL inesperada no mock de lookups: ${url}`);
  });
}

describe('ProductNewPage', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('estoque mínimo com mais de 3 casas decimais é rejeitado antes de chamar a API', async () => {
    mockLookups();
    const user = userEvent.setup();

    renderWithProviders(<ProductNewPage />);
    await screen.findByText('Ferramentas');

    await user.type(screen.getByLabelText(/^sku/i), 'TST-0001');
    await user.type(screen.getByLabelText(/^nome/i), 'Produto de teste');
    await user.type(screen.getByLabelText(/estoque mínimo/i), '10.1234');
    await user.click(screen.getByRole('button', { name: 'Cadastrar' }));

    expect(await screen.findByText(/decimal com até 3 casas/i)).toBeInTheDocument();
    const callsToProducts = vi
      .mocked(fetch)
      .mock.calls.filter(
        (call) => (call[0] as string).includes('/products') && call[1]?.method === 'POST',
      );
    expect(callsToProducts).toHaveLength(0);
  });

  it('cadastra um produto sem enviar currentStock no corpo da requisição', async () => {
    mockLookups();
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
      if (url.includes('/products') && init?.method === 'POST') {
        return Promise.resolve(
          jsonResponse(201, {
            id: 'p9',
            sku: 'TST-0001',
            name: 'Produto de teste',
            description: null,
            categoryId: 'c1',
            supplierId: null,
            unit: 'UN',
            currentStock: '0.000',
            minStock: '0.000',
            unitCost: '0.0000',
            isActive: true,
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
          }),
        );
      }
      throw new Error(`URL inesperada: ${url}`);
    });

    const user = userEvent.setup();
    renderWithProviders(<ProductNewPage />);
    await screen.findByText('Ferramentas');

    await user.type(screen.getByLabelText(/^sku/i), 'TST-0001');
    await user.type(screen.getByLabelText(/^nome/i), 'Produto de teste');
    await user.click(screen.getByRole('combobox', { name: /categoria/i }));
    await user.click(await screen.findByRole('option', { name: 'Ferramentas' }));
    await user.click(screen.getByRole('button', { name: 'Cadastrar' }));

    await waitFor(() => {
      const postCall = vi
        .mocked(fetch)
        .mock.calls.find(
          (call) => (call[0] as string).includes('/products') && call[1]?.method === 'POST',
        );
      expect(postCall).toBeDefined();
    });

    const postCall = vi
      .mocked(fetch)
      .mock.calls.find(
        (call) => (call[0] as string).includes('/products') && call[1]?.method === 'POST',
      );
    const body = JSON.parse(postCall?.[1]?.body as string) as Record<string, unknown>;

    expect(body).not.toHaveProperty('currentStock');
    expect(body).toEqual({
      sku: 'TST-0001',
      name: 'Produto de teste',
      categoryId: 'c1',
      unit: 'UN',
    });
  });
});
