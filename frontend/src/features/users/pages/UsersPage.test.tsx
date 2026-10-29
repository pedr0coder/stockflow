import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/test/render';
import { UsersPage } from './UsersPage';

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

const USUARIO = {
  id: 'u5',
  name: 'Carla Operadora',
  email: 'operador@stockflow.local',
  role: 'OPERATOR',
  isActive: true,
  lastLoginAt: '2026-01-10T08:00:00.000Z',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

describe('UsersPage', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('mostra os usuários reais, com papel traduzido', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(200, page([USUARIO])));

    renderWithProviders(<UsersPage />, {
      user: { id: 'u1', name: 'Admin', email: 'admin@x.com', role: 'ADMIN' },
    });

    expect(await screen.findByText('Carla Operadora')).toBeInTheDocument();
    expect(screen.getByText('Operador')).toBeInTheDocument();
  });

  it('ADMIN vê o botão de novo usuário; MANAGER não', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse(200, page([USUARIO])))
      .mockResolvedValueOnce(jsonResponse(200, page([USUARIO])));

    const { unmount } = renderWithProviders(<UsersPage />, {
      user: { id: 'u1', name: 'Admin', email: 'admin@x.com', role: 'ADMIN' },
    });
    await screen.findByText('Carla Operadora');
    expect(screen.getByRole('link', { name: /novo usuário/i })).toBeInTheDocument();
    unmount();

    renderWithProviders(<UsersPage />, {
      user: { id: 'u2', name: 'Manager', email: 'manager@x.com', role: 'MANAGER' },
    });
    await screen.findByText('Carla Operadora');
    expect(screen.queryByRole('link', { name: /novo usuário/i })).not.toBeInTheDocument();
  });

  it('filtrar por papel envia o parâmetro role', async () => {
    const user = userEvent.setup();
    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse(200, page([USUARIO])))
      .mockResolvedValueOnce(jsonResponse(200, page([])));

    renderWithProviders(<UsersPage />, {
      user: { id: 'u1', name: 'Admin', email: 'admin@x.com', role: 'ADMIN' },
    });
    await screen.findByText('Carla Operadora');

    const combos = screen.getAllByRole('combobox');
    await user.click(combos[0]!);
    await user.click(await screen.findByRole('option', { name: 'Administrador' }));

    await waitFor(() => {
      const call = vi
        .mocked(fetch)
        .mock.calls.map((c) => c[0] as string)
        .find((url) => url.includes('role=ADMIN'));
      expect(call).toBeDefined();
    });
  });

  it('estado vazio quando não há usuário', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(200, page([])));

    renderWithProviders(<UsersPage />, {
      user: { id: 'u1', name: 'Admin', email: 'admin@x.com', role: 'ADMIN' },
    });

    expect(await screen.findByText('Nenhum usuário cadastrado')).toBeInTheDocument();
  });
});
