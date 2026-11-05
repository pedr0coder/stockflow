import { screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/test/render';
import { InventoryProductCell } from './InventoryProductCell';

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

describe('InventoryProductCell (M7C-2)', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('com nome e SKU no item, renderiza na hora e NÃO busca o produto', () => {
    renderWithProviders(
      <InventoryProductCell productId="p1" productSku="FER-0001" productName="Chave de fenda" />,
    );

    expect(screen.getByText('Chave de fenda')).toBeInTheDocument();
    expect(screen.getByText('FER-0001')).toBeInTheDocument();
    expect(screen.getByRole('link')).toHaveAttribute('href', '/products/p1');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('sem nome/SKU (resposta antiga), cai para a busca por id', async () => {
    vi.mocked(fetch).mockImplementation((input) => {
      const url = input as string;

      if (url.endsWith('/products/p1')) {
        return Promise.resolve(jsonResponse(200, PRODUTO));
      }
      throw new Error(`URL inesperada: ${url}`);
    });

    renderWithProviders(<InventoryProductCell productId="p1" />);

    expect(screen.getByText('Carregando…')).toBeInTheDocument();
    expect(await screen.findByText('Chave de fenda')).toBeInTheDocument();
    expect(screen.getByText('FER-0001')).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('só um dos dois campos presente também usa a busca (não mostra dado pela metade)', async () => {
    vi.mocked(fetch).mockImplementation(() => Promise.resolve(jsonResponse(200, PRODUTO)));

    renderWithProviders(<InventoryProductCell productId="p1" productName="Só o nome" />);

    expect(await screen.findByText('Chave de fenda')).toBeInTheDocument();
    expect(screen.queryByText('Só o nome')).not.toBeInTheDocument();
  });
});
