import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/test/render';
import { UserDetailPage } from './UserDetailPage';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
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

function renderPage(role: 'ADMIN' | 'MANAGER' = 'ADMIN') {
  return renderWithProviders(
    <Routes>
      <Route path="/users/:id" element={<UserDetailPage />} />
    </Routes>,
    { route: '/users/u5', user: { id: 'u1', name: 'Me', email: 'me@x.com', role } },
  );
}

describe('UserDetailPage', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('mostra os dados reais do usuário', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(200, USUARIO));
    renderPage();

    expect(await screen.findByText('operador@stockflow.local')).toBeInTheDocument();
    expect(screen.getByText('Ativo')).toBeInTheDocument();
  });

  it('MANAGER não vê o bloco de papel e acesso (ADMIN apenas)', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(200, USUARIO));
    renderPage('MANAGER');

    await screen.findByText('operador@stockflow.local');

    expect(screen.queryByText('Papel e acesso')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Editar' })).not.toBeInTheDocument();
  });

  it('trocar o papel chama PATCH /users/:id/role com o valor novo', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(200, USUARIO));
    const user = userEvent.setup();
    renderPage();

    await screen.findByText('operador@stockflow.local');

    vi.mocked(fetch).mockImplementationOnce((input, init) => {
      const url = input as string;
      expect(url).toContain('/users/u5/role');
      const body = JSON.parse(init?.body as string) as Record<string, unknown>;
      expect(body).toEqual({ role: 'MANAGER' });
      return Promise.resolve(jsonResponse(200, { ...USUARIO, role: 'MANAGER' }));
    });

    const roleSelect = screen.getByRole('combobox');
    await user.click(roleSelect);
    await user.click(await screen.findByRole('option', { name: 'Gerente' }));

    await waitFor(() => {
      const roleCall = vi
        .mocked(fetch)
        .mock.calls.find((call) => (call[0] as string).includes('/role'));
      expect(roleCall).toBeDefined();
    });
  });

  it('e-mail já cadastrado (409) ao editar mostra mensagem compreensível', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(200, USUARIO));
    const user = userEvent.setup();
    renderPage();

    await screen.findByText('operador@stockflow.local');
    await user.click(screen.getByRole('button', { name: 'Editar' }));

    vi.mocked(fetch).mockResolvedValueOnce(
      jsonResponse(409, {
        code: 'EMAIL_ALREADY_EXISTS',
        message: 'Já existe uma conta com este e-mail.',
      }),
    );

    await user.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(await screen.findByText('Já existe uma conta com este e-mail.')).toBeInTheDocument();
  });
});
