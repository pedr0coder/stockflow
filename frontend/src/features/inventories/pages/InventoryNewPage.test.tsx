import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/test/render';
import { InventoryNewPage } from './InventoryNewPage';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function page(data: unknown[]) {
  return {
    data,
    meta: { page: 1, limit: 10, total: data.length, totalPages: 1, hasNext: false, hasPrev: false },
  };
}

const PRODUTO_A = {
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

function mockApi(): void {
  vi.mocked(fetch).mockImplementation((input) => {
    const url = input as string;

    if (url.includes('/products')) {
      return Promise.resolve(jsonResponse(200, page([PRODUTO_A])));
    }

    throw new Error(`URL inesperada: ${url}`);
  });
}

describe('InventoryNewPage', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('botão de abrir fica desabilitado sem produto selecionado', () => {
    mockApi();
    renderWithProviders(<InventoryNewPage />);

    expect(screen.getByRole('button', { name: 'Abrir inventário' })).toBeDisabled();
  });

  it('adicionar um produto habilita o envio e mostra o contador', async () => {
    mockApi();
    const user = userEvent.setup();
    renderWithProviders(<InventoryNewPage />);

    await user.type(screen.getByPlaceholderText('Buscar por SKU ou nome para adicionar…'), 'chave');
    await user.click(await screen.findByRole('button', { name: 'Adicionar' }));

    expect(screen.getByText('1 / 200')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Abrir inventário' })).toBeEnabled();
  });

  it('abre o inventário enviando exatamente os productIds selecionados', async () => {
    mockApi();
    const user = userEvent.setup();
    renderWithProviders(<InventoryNewPage />);

    await user.type(screen.getByPlaceholderText('Buscar por SKU ou nome para adicionar…'), 'chave');
    await user.click(await screen.findByRole('button', { name: 'Adicionar' }));

    vi.mocked(fetch).mockImplementationOnce((input, init) => {
      const url = input as string;
      expect(url).toContain('/inventories');
      const body = JSON.parse(init?.body as string) as Record<string, unknown>;
      expect(body).toEqual({ productIds: ['p1'] });
      return Promise.resolve(
        jsonResponse(201, {
          id: 'inv1',
          code: 'INV-2026-0001',
          status: 'OPEN',
          note: null,
          startedAt: '2026-01-10T00:00:00.000Z',
          closedAt: null,
          createdBy: { id: 'u1', name: 'Ana' },
          approvedBy: null,
          approvedAt: null,
        }),
      );
    });

    await user.click(screen.getByRole('button', { name: 'Abrir inventário' }));

    await waitFor(() => expect(fetch).toHaveBeenCalled());
  });

  it('remover um produto selecionado funciona e atualiza o contador', async () => {
    mockApi();
    const user = userEvent.setup();
    renderWithProviders(<InventoryNewPage />);

    await user.type(screen.getByPlaceholderText('Buscar por SKU ou nome para adicionar…'), 'chave');
    await user.click(await screen.findByRole('button', { name: 'Adicionar' }));
    expect(screen.getByText('1 / 200')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /remover chave de fenda/i }));

    expect(screen.getByText('0 / 200')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Abrir inventário' })).toBeDisabled();
  });
});
