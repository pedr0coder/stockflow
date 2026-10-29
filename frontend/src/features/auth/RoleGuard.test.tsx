import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { describe, expect, it } from 'vitest';
import { AuthContext } from './auth-context';
import { RoleGuard } from './RoleGuard';
import type { AuthContextValue, AuthUser } from '@/types/auth';

function renderAt(role: AuthUser['role']): void {
  const user: AuthUser = { id: 'u1', name: 'Pessoa', email: 'teste@local', role };
  const value: AuthContextValue = {
    user,
    isLoading: false,
    isAuthenticated: true,
    signIn: () => Promise.resolve(),
    signOut: () => undefined,
  };

  render(
    <MemoryRouter initialEntries={['/audit']}>
      <AuthContext value={value}>
        <Routes>
          <Route element={<RoleGuard roles={['ADMIN']} />}>
            <Route path="/audit" element={<p>conteúdo de auditoria</p>} />
          </Route>
        </Routes>
      </AuthContext>
    </MemoryRouter>,
  );
}

describe('RoleGuard', () => {
  it('deixa passar quem tem o papel exigido', () => {
    renderAt('ADMIN');

    expect(screen.getByText('conteúdo de auditoria')).toBeInTheDocument();
  });

  it('mostra a página de acesso negado, nomeada, para quem não tem o papel', () => {
    renderAt('OPERATOR');

    expect(screen.queryByText('conteúdo de auditoria')).not.toBeInTheDocument();
    expect(screen.getByText('Acesso não permitido')).toBeInTheDocument();
    expect(
      screen.getByText('Seu perfil não tem permissão para acessar esta página.'),
    ).toBeInTheDocument();
  });

  it('a página de acesso negado oferece um caminho de volta', () => {
    renderAt('MANAGER');

    expect(screen.getByRole('link', { name: 'Ir para o dashboard' })).toHaveAttribute(
      'href',
      '/dashboard',
    );
  });

  /**
   * Documentação executável, como em `ProtectedRoute.test.tsx` e
   * `nav-items.ts`: isto é controle de NAVEGAÇÃO, não de acesso. Um papel
   * qualquer no contexto basta para passar — nenhum token foi conferido,
   * nenhuma permissão foi validada de verdade. A autorização real é do
   * backend (docs/08-seguranca.md §8.3).
   */
  it('é controle de navegação, não de acesso', () => {
    renderAt('ADMIN');

    expect(screen.getByText('conteúdo de auditoria')).toBeInTheDocument();
  });
});
