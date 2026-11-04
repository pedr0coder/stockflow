import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/test/render';
import type { Product } from '@/features/products/api';
import { ProductPicker } from './ProductPicker';

/**
 * Cobertura do que mudou no Marco 7A (A4): a lista agora é operável por
 * teclado, e `aria-selected`/`aria-activedescendant` refletem um realce real,
 * em vez de nunca apontar para nada.
 */

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function produto(overrides: Partial<Product>): Product {
  return {
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
    ...overrides,
  };
}

function page(data: Product[]) {
  return {
    data,
    meta: { page: 1, limit: 10, total: data.length, totalPages: 1, hasNext: false, hasPrev: false },
  };
}

const PRODUTOS = [
  produto({ id: 'p1', sku: 'FER-0001', name: 'Chave de fenda' }),
  produto({ id: 'p2', sku: 'FER-0002', name: 'Chave inglesa' }),
];

function mockProductSearch(data: Product[] = PRODUTOS): void {
  vi.mocked(fetch).mockImplementation((input) => {
    const url = input as string;

    if (url.includes('/products')) {
      return Promise.resolve(jsonResponse(200, page(data)));
    }

    throw new Error(`URL inesperada: ${url}`);
  });
}

/** Wrapper controlado: o próprio `ProductPicker` não guarda o valor selecionado. */
function ControlledPicker(): React.ReactElement {
  const [value, setValue] = useState<Product | null>(null);

  return <ProductPicker value={value} onChange={setValue} />;
}

describe('ProductPicker', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('ArrowDown realça a primeira opção, refletido em aria-activedescendant e aria-selected', async () => {
    mockProductSearch();
    const user = userEvent.setup();
    renderWithProviders(<ControlledPicker />);

    const input = screen.getByPlaceholderText('Buscar por SKU ou nome…');
    await user.type(input, 'chave');
    await screen.findByRole('option', { name: /chave de fenda/i });

    await user.keyboard('{ArrowDown}');

    const primeiraOpcao = screen.getByRole('option', { name: /chave de fenda/i });
    expect(primeiraOpcao).toHaveAttribute('aria-selected', 'true');
    expect(input).toHaveAttribute('aria-activedescendant', primeiraOpcao.id);

    const segundaOpcao = screen.getByRole('option', { name: /chave inglesa/i });
    expect(segundaOpcao).toHaveAttribute('aria-selected', 'false');
  });

  it('ArrowDown duas vezes move o realce para a segunda opção', async () => {
    mockProductSearch();
    const user = userEvent.setup();
    renderWithProviders(<ControlledPicker />);

    await user.type(screen.getByPlaceholderText('Buscar por SKU ou nome…'), 'chave');
    await screen.findByRole('option', { name: /chave de fenda/i });

    await user.keyboard('{ArrowDown}{ArrowDown}');

    expect(screen.getByRole('option', { name: /chave inglesa/i })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  it('ArrowDown não passa da última opção', async () => {
    mockProductSearch();
    const user = userEvent.setup();
    renderWithProviders(<ControlledPicker />);

    await user.type(screen.getByPlaceholderText('Buscar por SKU ou nome…'), 'chave');
    await screen.findByRole('option', { name: /chave de fenda/i });

    await user.keyboard('{ArrowDown}{ArrowDown}{ArrowDown}{ArrowDown}');

    expect(screen.getByRole('option', { name: /chave inglesa/i })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  it('Enter seleciona a opção realçada e fecha a lista', async () => {
    mockProductSearch();
    const user = userEvent.setup();
    renderWithProviders(<ControlledPicker />);

    await user.type(screen.getByPlaceholderText('Buscar por SKU ou nome…'), 'chave');
    await screen.findByRole('option', { name: /chave de fenda/i });

    await user.keyboard('{ArrowDown}{Enter}');

    expect(screen.getByText('FER-0001')).toBeInTheDocument();
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('Enter sem nenhuma opção realçada não seleciona nada', async () => {
    mockProductSearch();
    const user = userEvent.setup();
    renderWithProviders(<ControlledPicker />);

    await user.type(screen.getByPlaceholderText('Buscar por SKU ou nome…'), 'chave');
    await screen.findByRole('option', { name: /chave de fenda/i });

    await user.keyboard('{Enter}');

    // A lista continua aberta e nada foi escolhido: a view de "selecionado"
    // (que traz o botão "Trocar") não aparece.
    expect(screen.getByRole('listbox')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Trocar' })).not.toBeInTheDocument();
  });

  it('Escape fecha a lista sem selecionar', async () => {
    mockProductSearch();
    const user = userEvent.setup();
    renderWithProviders(<ControlledPicker />);

    await user.type(screen.getByPlaceholderText('Buscar por SKU ou nome…'), 'chave');
    await screen.findByRole('option', { name: /chave de fenda/i });

    await user.keyboard('{ArrowDown}{Escape}');

    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('clique numa opção continua funcionando (seleção por mouse)', async () => {
    mockProductSearch();
    const user = userEvent.setup();
    renderWithProviders(<ControlledPicker />);

    await user.type(screen.getByPlaceholderText('Buscar por SKU ou nome…'), 'chave');
    const opcao = await screen.findByRole('button', { name: /chave inglesa/i });
    await user.click(opcao);

    expect(screen.getByText('FER-0002')).toBeInTheDocument();
  });
});
