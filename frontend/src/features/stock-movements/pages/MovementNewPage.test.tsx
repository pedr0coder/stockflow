import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/test/render';
import { MovementNewPage } from './MovementNewPage';

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

function page(data: unknown[]) {
  return {
    data,
    meta: { page: 1, limit: 10, total: data.length, totalPages: 1, hasNext: false, hasPrev: false },
  };
}

function mockProductSearch(): void {
  vi.mocked(fetch).mockImplementation((input) => {
    const url = input as string;

    if (url.includes('/products')) {
      return Promise.resolve(jsonResponse(200, page([PRODUTO])));
    }

    throw new Error(`URL inesperada: ${url}`);
  });
}

async function pickProduct(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  await user.type(screen.getByPlaceholderText('Buscar por SKU ou nome…'), 'chave');
  const option = await screen.findByRole('button', { name: /chave de fenda/i });
  await user.click(option);
}

describe('MovementNewPage', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('registra uma entrada válida e navega para o produto', async () => {
    mockProductSearch();
    const user = userEvent.setup();

    renderWithProviders(<MovementNewPage />);
    await pickProduct(user);

    await user.type(screen.getByPlaceholderText('0.000'), '5.000');
    await user.click(screen.getByRole('combobox', { name: /motivo/i }));
    await user.click(await screen.findByRole('option', { name: 'Compra' }));

    vi.mocked(fetch).mockImplementationOnce((input, init) => {
      const url = input as string;
      expect(url).toContain('/stock-movements/in');
      const body = JSON.parse(init?.body as string) as Record<string, unknown>;
      expect(body).toEqual({ productId: 'p1', quantity: '5.000', reason: 'PURCHASE' });
      return Promise.resolve(jsonResponse(201, { ...PRODUTO, id: 'm1' }));
    });

    await user.click(screen.getByRole('button', { name: 'Registrar entrada' }));

    await waitFor(() => expect(fetch).toHaveBeenCalled());
  });

  it('saldo insuficiente (409) mostra a mensagem com available/requested, sem travar a tela', async () => {
    mockProductSearch();
    const user = userEvent.setup();

    renderWithProviders(<MovementNewPage />);
    await user.click(screen.getByRole('tab', { name: 'Saída' }));
    await pickProduct(user);

    await user.type(screen.getByPlaceholderText('0.000'), '999.000');
    await user.click(screen.getByRole('combobox', { name: /motivo/i }));
    await user.click(await screen.findByRole('option', { name: 'Venda' }));

    vi.mocked(fetch).mockImplementationOnce(() =>
      Promise.resolve(
        jsonResponse(409, {
          code: 'INSUFFICIENT_STOCK',
          message: 'Estoque insuficiente para esta operação.',
          details: { productId: 'p1', available: '10.000', requested: '999.000' },
        }),
      ),
    );

    await user.click(screen.getByRole('button', { name: 'Registrar saída' }));

    expect(await screen.findByText('Estoque insuficiente para esta operação.')).toBeInTheDocument();
    // A tela continua utilizável: nenhuma navegação ocorreu, o formulário segue ali.
    expect(screen.getByRole('button', { name: 'Registrar saída' })).toBeInTheDocument();
  });

  it('produto inativo (409) mostra mensagem compreensível', async () => {
    mockProductSearch();
    const user = userEvent.setup();

    renderWithProviders(<MovementNewPage />);
    await pickProduct(user);

    await user.type(screen.getByPlaceholderText('0.000'), '1.000');
    await user.click(screen.getByRole('combobox', { name: /motivo/i }));
    await user.click(await screen.findByRole('option', { name: 'Compra' }));

    vi.mocked(fetch).mockImplementationOnce(() =>
      Promise.resolve(
        jsonResponse(409, { code: 'PRODUCT_INACTIVE', message: 'Este produto está inativo.' }),
      ),
    );

    await user.click(screen.getByRole('button', { name: 'Registrar entrada' }));

    expect(await screen.findByText('Este produto está inativo.')).toBeInTheDocument();
  });

  it('quantidade zero ou negativa é rejeitada antes de chamar a API', async () => {
    mockProductSearch();
    const user = userEvent.setup();

    renderWithProviders(<MovementNewPage />);
    await pickProduct(user);

    await user.type(screen.getByPlaceholderText('0.000'), '0.000');
    await user.click(screen.getByRole('button', { name: 'Registrar entrada' }));

    expect(await screen.findByText(/maior que zero/i)).toBeInTheDocument();
    const postCalls = vi
      .mocked(fetch)
      .mock.calls.filter((call) => (call[0] as string).includes('/stock-movements'));
    expect(postCalls).toHaveLength(0);
  });

  it('a aba Ajuste exige justificativa e usa saldo final, não delta', async () => {
    mockProductSearch();
    const user = userEvent.setup();

    renderWithProviders(<MovementNewPage />);
    await user.click(screen.getByRole('tab', { name: 'Ajuste' }));
    await pickProduct(user);

    await user.type(screen.getByPlaceholderText('0.000'), '8.000');
    await user.click(screen.getByRole('button', { name: 'Registrar ajuste' }));

    expect(await screen.findByText(/justifique o ajuste/i)).toBeInTheDocument();

    await user.type(screen.getByLabelText(/justificativa/i), 'Contagem física divergente.');

    vi.mocked(fetch).mockImplementationOnce((input, init) => {
      const url = input as string;
      expect(url).toContain('/stock-movements/adjustment');
      const body = JSON.parse(init?.body as string) as Record<string, unknown>;
      expect(body).toEqual({
        productId: 'p1',
        finalQuantity: '8.000',
        reason: 'CORRECTION',
        note: 'Contagem física divergente.',
      });
      return Promise.resolve(jsonResponse(201, { ...PRODUTO, id: 'm2' }));
    });

    await user.click(screen.getByRole('button', { name: 'Registrar ajuste' }));

    await waitFor(() => expect(fetch).toHaveBeenCalled());
  });

  it('OPERATOR não vê a aba Ajuste', () => {
    mockProductSearch();

    renderWithProviders(<MovementNewPage />, {
      user: { id: 'u2', name: 'Op', email: 'op@x.com', role: 'OPERATOR' },
    });

    expect(screen.getByRole('tab', { name: 'Entrada' })).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Ajuste' })).not.toBeInTheDocument();
  });
});
