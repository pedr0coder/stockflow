import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/test/render';
import { UserNewPage } from './UserNewPage';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('UserNewPage', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('senha com menos de 10 caracteres é rejeitada antes de chamar a API', async () => {
    const user = userEvent.setup();
    renderWithProviders(<UserNewPage />);

    await user.type(screen.getByLabelText(/^nome/i), 'Pessoa Teste');
    await user.type(screen.getByLabelText(/e-mail/i), 'pessoa@x.com');
    await user.type(screen.getByLabelText(/senha provisória/i), 'curta123');
    await user.click(screen.getByRole('button', { name: 'Cadastrar' }));

    expect(await screen.findByText(/mínimo de 10 caracteres/i)).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('cadastra um usuário válido com o papel selecionado', async () => {
    const user = userEvent.setup();
    renderWithProviders(<UserNewPage />);

    await user.type(screen.getByLabelText(/^nome/i), 'Pessoa Teste');
    await user.type(screen.getByLabelText(/e-mail/i), 'pessoa@x.com');
    await user.type(screen.getByLabelText(/senha provisória/i), 'senha-bem-grande');
    await user.click(screen.getByRole('combobox'));
    await user.click(await screen.findByRole('option', { name: 'Gerente' }));

    vi.mocked(fetch).mockResolvedValueOnce(
      jsonResponse(201, {
        id: 'u9',
        name: 'Pessoa Teste',
        email: 'pessoa@x.com',
        role: 'MANAGER',
        isActive: true,
        lastLoginAt: null,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      }),
    );

    await user.click(screen.getByRole('button', { name: 'Cadastrar' }));

    await waitFor(() => {
      const postCall = vi
        .mocked(fetch)
        .mock.calls.find((call) => (call[0] as string).includes('/users'));
      expect(postCall).toBeDefined();
    });

    const postCall = vi
      .mocked(fetch)
      .mock.calls.find((call) => (call[0] as string).includes('/users'));
    const body = JSON.parse(postCall?.[1]?.body as string) as Record<string, unknown>;
    expect(body).toEqual({
      name: 'Pessoa Teste',
      email: 'pessoa@x.com',
      password: 'senha-bem-grande',
      role: 'MANAGER',
    });
  });

  it('e-mail já cadastrado (409) preserva o formulário preenchido', async () => {
    const user = userEvent.setup();
    renderWithProviders(<UserNewPage />);

    await user.type(screen.getByLabelText(/^nome/i), 'Pessoa Repetida');
    await user.type(screen.getByLabelText(/e-mail/i), 'repetido@x.com');
    await user.type(screen.getByLabelText(/senha provisória/i), 'senha-bem-grande');

    vi.mocked(fetch).mockResolvedValueOnce(
      jsonResponse(409, {
        code: 'EMAIL_ALREADY_EXISTS',
        message: 'Já existe uma conta com este e-mail.',
      }),
    );

    await user.click(screen.getByRole('button', { name: 'Cadastrar' }));

    expect(await screen.findByText('Já existe uma conta com este e-mail.')).toBeInTheDocument();
    expect(screen.getByLabelText(/^nome/i)).toHaveValue('Pessoa Repetida');
  });
});
