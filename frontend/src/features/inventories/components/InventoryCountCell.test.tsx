import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { InventoryItem } from '@/features/inventories/api';
import { renderWithProviders } from '@/test/render';
import { InventoryCountCell } from './InventoryCountCell';

function itemFixture(overrides: Partial<InventoryItem> = {}): InventoryItem {
  return {
    id: 'item1',
    productId: 'p1',
    productSku: 'FER-0001',
    productName: 'Chave de fenda',
    expectedQty: '10.000',
    countedQty: null,
    divergence: null,
    countedAt: null,
    countedBy: null,
    currentStock: '10.000',
    movedSinceCount: null,
    movementsSinceCount: null,
    ...overrides,
  };
}

describe('InventoryCountCell', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('usa o nome e SKU do produto no aria-label quando disponíveis e faz fallback para o ID do item', () => {
    const { unmount } = renderWithProviders(
      <InventoryCountCell inventoryId="inv1" item={itemFixture()} canCount />,
    );

    expect(
      screen.getByRole('textbox', { name: 'Quantidade contada para Chave de fenda (FER-0001)' }),
    ).toBeInTheDocument();
    unmount();

    const itemSemNome: InventoryItem = {
      id: 'item-legado',
      productId: 'p1',
      expectedQty: '10.000',
      countedQty: null,
      divergence: null,
      countedAt: null,
      countedBy: null,
      currentStock: '10.000',
      movedSinceCount: null,
      movementsSinceCount: null,
    };

    renderWithProviders(<InventoryCountCell inventoryId="inv1" item={itemSemNome} canCount />);

    expect(
      screen.getByRole('textbox', { name: 'Quantidade contada para o item item-legado' }),
    ).toBeInTheDocument();
  });

  it('associa a mensagem de erro ao input via aria-describedby e aria-invalid', async () => {
    const user = userEvent.setup();
    renderWithProviders(<InventoryCountCell inventoryId="inv1" item={itemFixture()} canCount />);

    const input = screen.getByRole('textbox', {
      name: 'Quantidade contada para Chave de fenda (FER-0001)',
    });
    expect(input).toHaveAttribute('aria-invalid', 'false');
    expect(input).not.toHaveAttribute('aria-describedby');

    await user.type(input, 'abc');
    await user.click(screen.getByRole('button', { name: 'Salvar' }));

    const alert = await screen.findByRole('alert');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAttribute('aria-describedby', alert.id);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('permite salvar a contagem pressionando Enter no campo de texto', async () => {
    const user = userEvent.setup();
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          ...itemFixture(),
          countedQty: '7.500',
          divergence: '-2.500',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    renderWithProviders(<InventoryCountCell inventoryId="inv1" item={itemFixture()} canCount />);

    const input = screen.getByRole('textbox', {
      name: 'Quantidade contada para Chave de fenda (FER-0001)',
    });
    await user.type(input, '7.500{Enter}');

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledTimes(1);
    });
    const [url, init] = vi.mocked(fetch).mock.calls[0]!;
    expect(url as string).toContain('/inventories/inv1/items/item1/count');
    expect(init?.method).toBe('PATCH');
  });
});
