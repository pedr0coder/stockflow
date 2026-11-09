import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { AuthContext } from '@/features/auth/auth-context';
import { ApiError } from '@/lib/api-client';
import { LoginPage } from './LoginPage';
import type { AuthContextValue } from '@/types/auth';

/**
 * A tela de login é real: valida com Zod e, ao submeter com sucesso, chama
 * `signIn` de verdade (via `AuthProvider`, injetado aqui como duplo). O que
 * mais importa provar é o que a Fase 3 já provava (nenhuma sessão fictícia),
 * só que agora pelo caminho contrário: a sessão É criada quando a credencial
 * é válida, e NÃO é criada quando é rejeitada.
 */
function renderLogin(signIn: AuthContextValue['signIn'] = vi.fn()) {
  const value: AuthContextValue = {
    user: null,
    isLoading: false,
    isAuthenticated: false,
    signIn,
    signOut: () => undefined,
  };

  render(
    <MemoryRouter initialEntries={['/login']}>
      <AuthContext value={value}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/dashboard" element={<p>conteúdo do dashboard</p>} />
        </Routes>
      </AuthContext>
    </MemoryRouter>,
  );
}

describe('LoginPage', () => {
  describe('validação', () => {
    it('recusa envio com os campos vazios', async () => {
      const user = userEvent.setup();
      renderLogin();

      await user.click(screen.getByRole('button', { name: 'Entrar' }));

      expect(await screen.findByText('Informe o e-mail.')).toBeInTheDocument();
      expect(screen.getByText('Informe a senha.')).toBeInTheDocument();
    });

    it('recusa e-mail em formato inválido', async () => {
      const user = userEvent.setup();
      renderLogin();

      await user.type(screen.getByRole('textbox', { name: /e-mail/i }), 'nao-e-email');
      await user.type(screen.getByLabelText(/^senha/i), 'senha-bem-grande');
      await user.click(screen.getByRole('button', { name: 'Entrar' }));

      expect(await screen.findByText('Informe um e-mail válido.')).toBeInTheDocument();
    });

    it('recusa senha mais curta que a política', async () => {
      const user = userEvent.setup();
      renderLogin();

      await user.type(screen.getByRole('textbox', { name: /e-mail/i }), 'ana@empresa.com');
      await user.type(screen.getByLabelText(/^senha/i), 'curta');
      await user.click(screen.getByRole('button', { name: 'Entrar' }));

      // Espelha o mínimo de 10 caracteres da §8.1.
      expect(
        await screen.findByText('A senha deve ter no mínimo 10 caracteres.'),
      ).toBeInTheDocument();
    });

    it('mostra o erro junto ao campo, associado a ele', async () => {
      const user = userEvent.setup();
      renderLogin();

      await user.click(screen.getByRole('button', { name: 'Entrar' }));
      await screen.findByText('Informe o e-mail.');

      expect(screen.getByRole('textbox', { name: /e-mail/i })).toHaveAccessibleDescription(
        'Informe o e-mail.',
      );
    });

    it('não chama signIn quando o formulário é inválido', async () => {
      const signIn = vi.fn();
      const user = userEvent.setup();
      renderLogin(signIn);

      await user.click(screen.getByRole('button', { name: 'Entrar' }));
      await screen.findByText('Informe o e-mail.');

      expect(signIn).not.toHaveBeenCalled();
    });
  });

  describe('autenticação real', () => {
    it('chama signIn com e-mail normalizado e senha, e navega ao dashboard', async () => {
      const signIn = vi.fn().mockResolvedValue(undefined);
      const user = userEvent.setup();
      renderLogin(signIn);

      await user.type(screen.getByRole('textbox', { name: /e-mail/i }), 'Ana@Empresa.com');
      await user.type(screen.getByLabelText(/^senha/i), 'uma-senha-valida');
      await user.click(screen.getByRole('button', { name: 'Entrar' }));

      expect(signIn).toHaveBeenCalledWith('ana@empresa.com', 'uma-senha-valida');
      expect(await screen.findByText('conteúdo do dashboard')).toBeInTheDocument();
    });

    it('credencial inválida (401) mostra mensagem específica, sem navegar', async () => {
      const signIn = vi.fn().mockRejectedValue(new ApiError(401, 'INVALID_CREDENTIALS', 'x'));
      const user = userEvent.setup();
      renderLogin(signIn);

      await user.type(screen.getByRole('textbox', { name: /e-mail/i }), 'ana@empresa.com');
      await user.type(screen.getByLabelText(/^senha/i), 'uma-senha-errada');
      await user.click(screen.getByRole('button', { name: 'Entrar' }));

      expect(await screen.findByRole('alert')).toHaveTextContent('E-mail ou senha incorretos.');
      expect(screen.queryByText('conteúdo do dashboard')).not.toBeInTheDocument();
    });

    it('falha de rede ou servidor mostra mensagem genérica, não a mensagem de credencial', async () => {
      const signIn = vi.fn().mockRejectedValue(new Error('falha de rede'));
      const user = userEvent.setup();
      renderLogin(signIn);

      await user.type(screen.getByRole('textbox', { name: /e-mail/i }), 'ana@empresa.com');
      await user.type(screen.getByLabelText(/^senha/i), 'uma-senha-valida');
      await user.click(screen.getByRole('button', { name: 'Entrar' }));

      expect(await screen.findByRole('alert')).toHaveTextContent(
        'Não foi possível entrar. Tente novamente.',
      );
    });

    it('desabilita o botão de submit durante o envio', async () => {
      let resolveSignIn: () => void = () => undefined;
      const signIn = vi.fn(
        () =>
          new Promise<void>((resolve) => {
            resolveSignIn = resolve;
          }),
      );
      const user = userEvent.setup();
      renderLogin(signIn);

      await user.type(screen.getByRole('textbox', { name: /e-mail/i }), 'ana@empresa.com');
      await user.type(screen.getByLabelText(/^senha/i), 'uma-senha-valida');
      await user.click(screen.getByRole('button', { name: 'Entrar' }));

      expect(await screen.findByRole('button', { name: /entrando/i })).toBeDisabled();
      resolveSignIn();
    });
  });

  describe('usabilidade', () => {
    it('permite revelar e ocultar a senha', async () => {
      const user = userEvent.setup();
      renderLogin();

      const campo = screen.getByLabelText(/^senha/i);
      expect(campo).toHaveAttribute('type', 'password');

      await user.click(screen.getByRole('button', { name: /mostrar senha/i }));
      expect(campo).toHaveAttribute('type', 'text');

      await user.click(screen.getByRole('button', { name: /ocultar senha/i }));
      expect(campo).toHaveAttribute('type', 'password');
    });

    it('marca os campos como obrigatórios em texto', () => {
      renderLogin();

      expect(screen.getAllByText('(obrigatório)')).toHaveLength(2);
    });

    it('expõe o título da página como cabeçalho h1 semântico', () => {
      renderLogin();

      expect(screen.getByRole('heading', { level: 1, name: 'Entrar' })).toBeInTheDocument();
    });
  });
});
