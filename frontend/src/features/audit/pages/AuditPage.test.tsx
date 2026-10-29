import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/test/render';
import { AuditPage } from './AuditPage';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function page(data: unknown[]) {
  return {
    data,
    meta: { page: 1, limit: 20, total: data.length, totalPages: 1, hasNext: false, hasPrev: false },
  };
}

const REGISTRO = {
  id: 'a1',
  userId: 'u1',
  actorEmail: 'admin@stockflow.local',
  action: 'PRODUCT_CREATED',
  entity: 'Product',
  entityId: 'p1',
  before: null,
  after: { sku: 'FER-0001', name: 'Chave de fenda' },
  ip: '127.0.0.1',
  userAgent: 'vitest',
  createdAt: '2026-01-10T14:30:00.000Z',
};

describe('AuditPage', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('mostra os eventos reais de auditoria', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(200, page([REGISTRO])));

    renderWithProviders(<AuditPage />);

    expect(await screen.findByText('PRODUCT_CREATED')).toBeInTheDocument();
    expect(screen.getByText('admin@stockflow.local')).toBeInTheDocument();
  });

  it('abrir os detalhes mostra o estado anterior e posterior em JSON, somente leitura', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(200, page([REGISTRO])));
    const user = userEvent.setup();

    renderWithProviders(<AuditPage />);
    await screen.findByText('PRODUCT_CREATED');

    await user.click(screen.getByRole('button', { name: 'Ver' }));

    expect(await screen.findByText('Nenhum (criação)')).toBeInTheDocument();
    expect(screen.getByText(/"sku": "FER-0001"/)).toBeInTheDocument();
    // Somente leitura: não há campo editável nem botão de salvar no painel.
    expect(screen.queryByRole('button', { name: /salvar/i })).not.toBeInTheDocument();
  });

  it('filtrar por ação envia o parâmetro certo', async () => {
    const user = userEvent.setup();
    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse(200, page([REGISTRO])))
      .mockResolvedValueOnce(jsonResponse(200, page([])));

    renderWithProviders(<AuditPage />);
    await screen.findByText('PRODUCT_CREATED');

    await user.type(screen.getByLabelText(/filtrar por ação/i), 'PRODUCT_CREATED');

    await waitFor(() => {
      const call = vi
        .mocked(fetch)
        .mock.calls.map((c) => c[0] as string)
        .find((url) => url.includes('action=PRODUCT_CREATED'));
      expect(call).toBeDefined();
    });
  });

  it('estado vazio quando não há evento', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(200, page([])));

    renderWithProviders(<AuditPage />);

    expect(await screen.findByText('Nenhum evento registrado')).toBeInTheDocument();
  });
});
