import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { AuthContext, UiPreviewContext } from '@/features/auth/auth-context';
import { LoginPage } from './LoginPage';
import type { AuthContextValue } from '@/types/auth';

/**
 * A tela de login da Fase 3 valida de verdade e **não autentica**.
 *
 * O caso que mais importa aqui é "submeter não cria sessão": é a diferença
 * entre uma tela honesta e uma simulação de autenticação.
 */
const SEM_SESSAO: AuthContextValue = {
  user: null,
  isLoading: false,
  isAuthenticated: false,
  signOut: () => undefined,
  isPreview: true,
};

function renderLogin() {
  const startPreview = vi.fn();
  const setPreviewRole = vi.fn();

  render(
    <MemoryRouter>
      <AuthContext value={SEM_SESSAO}>
        <UiPreviewContext value={{ startPreview, setPreviewRole }}>
          <LoginPage />
        </UiPreviewContext>
      </AuthContext>
    </MemoryRouter>,
  );

  return { startPreview };
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
  });

  describe('honestidade', () => {
    it('NÃO cria sessão ao submeter credenciais válidas', async () => {
      const user = userEvent.setup();
      const { startPreview } = renderLogin();

      await user.type(screen.getByRole('textbox', { name: /e-mail/i }), 'ana@empresa.com');
      await user.type(screen.getByLabelText(/^senha/i), 'uma-senha-valida');
      await user.click(screen.getByRole('button', { name: 'Entrar' }));

      // Nenhuma sessão, de nenhum tipo, é criada pelo formulário.
      expect(startPreview).not.toHaveBeenCalled();
    });

    it('declara que a autenticação ainda não existe', async () => {
      const user = userEvent.setup();
      renderLogin();

      await user.type(screen.getByRole('textbox', { name: /e-mail/i }), 'ana@empresa.com');
      await user.type(screen.getByLabelText(/^senha/i), 'uma-senha-valida');
      await user.click(screen.getByRole('button', { name: 'Entrar' }));

      expect(await screen.findByRole('status')).toHaveTextContent(
        /autenticação ainda não foi implementada/i,
      );
    });

    it('a pré-visualização é um caminho separado e nomeado', () => {
      renderLogin();

      const secao = screen.getByRole('region', { name: /visualizar a interface \(sem backend\)/i });

      expect(secao).toHaveTextContent(/não autentica ninguém/i);
      expect(secao).toHaveTextContent(/não exibe dado real/i);
    });

    it('inicia a pré-visualização apenas pelo botão próprio', async () => {
      const user = userEvent.setup();
      const { startPreview } = renderLogin();

      await user.click(screen.getByRole('button', { name: /visualizar interface/i }));

      expect(startPreview).toHaveBeenCalledWith('OPERATOR');
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
  });
});
