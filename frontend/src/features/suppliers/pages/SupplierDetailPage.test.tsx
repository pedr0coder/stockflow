import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/test/render';
import { SupplierDetailPage } from './SupplierDetailPage';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function emptyPage() {
  return {
    data: [],
    meta: { page: 1, limit: 20, total: 0, totalPages: 0, hasNext: false, hasPrev: false },
  };
}

const FORNECEDOR = {
  id: 's1',
  name: 'Distribuidora Norte',
  taxId: '11.111.111/0001-11',
  email: 'contato@norte.invalid',
  phone: '(11) 4000-0000',
  notes: null,
  isActive: true,
  createdAt: '2026-01-05T00:00:00.000Z',
  updatedAt: '2026-01-05T00:00:00.000Z',
};

const PRODUTO_VINCULADO = {
  id: 'p1',
  sku: 'FER-0001',
  name: 'Chave de fenda',
  description: null,
  categoryId: 'c1',
  supplierId: 's1',
  unit: 'UN',
  currentStock: '12.000',
  minStock: '5.000',
  unitCost: '9.9900',
  isActive: true,
  createdAt: '2026-01-05T00:00:00.000Z',
  updatedAt: '2026-01-05T00:00:00.000Z',
};

function renderPage() {
  return renderWithProviders(
    <Routes>
      <Route path="/suppliers/:id" element={<SupplierDetailPage />} />
    </Routes>,
    { route: '/suppliers/s1' },
  );
}

describe('SupplierDetailPage', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('mostra os dados do fornecedor e os produtos vinculados reais', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse(200, FORNECEDOR))
      .mockResolvedValueOnce(
        jsonResponse(200, {
          data: [PRODUTO_VINCULADO],
          meta: { page: 1, limit: 20, total: 1, totalPages: 1, hasNext: false, hasPrev: false },
        }),
      );

    renderPage();

    expect(await screen.findByRole('heading', { name: 'Distribuidora Norte' })).toBeInTheDocument();
    expect(screen.getByText('contato@norte.invalid')).toBeInTheDocument();

    const table = within(
      await screen.findByRole('table', { name: 'Produtos vinculados a Distribuidora Norte' }),
    );
    expect(table.getByText('Chave de fenda')).toBeInTheDocument();

    const [, cardList] = screen.getAllByRole('list');
    expect(within(cardList!).getByText('Chave de fenda')).toBeInTheDocument();
  });

  it('sem produto vinculado, mostra o estado vazio específico', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse(200, FORNECEDOR))
      .mockResolvedValueOnce(jsonResponse(200, emptyPage()));

    renderPage();

    expect(await screen.findByText('Nenhum produto vinculado')).toBeInTheDocument();
  });

  it('editar, salvar, e a lista reflete o novo nome', async () => {
    const user = userEvent.setup();
    const atualizado = { ...FORNECEDOR, name: 'Distribuidora Norte Ltda' };
    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse(200, FORNECEDOR))
      .mockResolvedValueOnce(jsonResponse(200, emptyPage()))
      .mockResolvedValueOnce(jsonResponse(200, atualizado)) // PATCH
      .mockResolvedValueOnce(jsonResponse(200, atualizado)) // refetch do detalhe, invalidado
      .mockResolvedValueOnce(jsonResponse(200, emptyPage())); // refetch dos produtos vinculados, invalidado

    renderPage();
    await screen.findByRole('heading', { name: 'Distribuidora Norte' });

    await user.click(screen.getByRole('button', { name: 'Editar' }));
    const nameInput = screen.getByLabelText(/^nome/i);
    await user.clear(nameInput);
    await user.type(nameInput, 'Distribuidora Norte Ltda');
    await user.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Distribuidora Norte Ltda' })).toBeInTheDocument(),
    );
  });

  it('erro ao alterar a situação aparece como notificação, sem travar a tela', async () => {
    const user = userEvent.setup();
    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse(200, FORNECEDOR))
      .mockResolvedValueOnce(jsonResponse(200, emptyPage()))
      .mockResolvedValueOnce(jsonResponse(500, { code: 'INTERNAL_ERROR' }));

    renderPage();
    await screen.findByRole('heading', { name: 'Distribuidora Norte' });

    await user.click(screen.getByRole('button', { name: 'Inativar' }));
    await user.click(screen.getByRole('button', { name: 'Confirmar' }));

    expect(await screen.findByText(/erro inesperado/i)).toBeInTheDocument();
    // A situação na tela não mudou: a mutação falhou.
    expect(screen.getByRole('button', { name: 'Inativar' })).toBeInTheDocument();
  });
});
