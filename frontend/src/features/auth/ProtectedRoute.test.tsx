import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { describe, expect, it } from 'vitest';
import { AuthContext } from './auth-context';
import { ProtectedRoute } from './ProtectedRoute';
import type { AuthContextValue, AuthUser } from '@/types/auth';

/**
 * O destino de cada rota é um texto simples: o que importa é **onde** a
 * navegação terminou, não o que a tela de destino renderiza.
 */
/**
 * Retorno `void` e não `ReactNode`: no React 19, `ReactNode` inclui
 * `Promise<AwaitedReactNode>`, e uma função tipada assim é tratada como
 * possivelmente assíncrona pela regra `no-floating-promises`. Esta função só
 * renderiza.
 */
function renderAt(route: string, auth: { user: AuthUser | null; isLoading?: boolean }): void {
  const value: AuthContextValue = {
    user: auth.user,
    isLoading: auth.isLoading ?? false,
    isAuthenticated: auth.user !== null,
    signIn: () => Promise.resolve(),
    signOut: () => undefined,
  };

  render(
    <MemoryRouter initialEntries={[route]}>
      <AuthContext value={value}>
        <Routes>
          <Route path="/login" element={<p>tela de login</p>} />
          <Route element={<ProtectedRoute />}>
            <Route path="/dashboard" element={<p>conteúdo protegido</p>} />
          </Route>
        </Routes>
      </AuthContext>
    </MemoryRouter>,
  );
}

const USUARIO: AuthUser = {
  id: 'u1',
  name: 'Pessoa de Teste',
  email: 'teste@local',
  role: 'OPERATOR',
};

describe('ProtectedRoute', () => {
  it('manda para o login quem não tem sessão', () => {
    renderAt('/dashboard', { user: null });

    expect(screen.getByText('tela de login')).toBeInTheDocument();
    expect(screen.queryByText('conteúdo protegido')).not.toBeInTheDocument();
  });

  it('deixa passar quem tem sessão', () => {
    renderAt('/dashboard', { user: USUARIO });

    expect(screen.getByText('conteúdo protegido')).toBeInTheDocument();
  });

  it('não pisca a tela de login enquanto a sessão é verificada', () => {
    renderAt('/dashboard', { user: null, isLoading: true });

    // Este é o caso que costuma ser esquecido. Sem ele, toda recarga de página
    // mostraria o login por um instante antes de restaurar a sessão.
    expect(screen.queryByText('tela de login')).not.toBeInTheDocument();
    expect(screen.queryByText('conteúdo protegido')).not.toBeInTheDocument();
  });

  it('informa o carregamento para tecnologia assistiva', () => {
    renderAt('/dashboard', { user: null, isLoading: true });

    expect(screen.getByRole('status')).toHaveTextContent(/verificando sessão/i);
  });

  it('é controle de navegação, não de acesso', () => {
    // ┌────────────────────────────────────────────────────────────────────┐
    // │ Documentação executável, como no teste da sidebar.                 │
    // │                                                                    │
    // │ Este componente evita que alguém sem sessão veja uma tela que não  │
    // │ vai funcionar. Ele não protege dado nenhum: o dado vem da API, e é │
    // │ lá que a autorização é verificada (docs/08-seguranca.md §8.3).     │
    // │                                                                    │
    // │ O caso abaixo mostra o limite: basta um objeto de usuário no       │
    // │ contexto para o conteúdo renderizar. Nenhum token foi validado,    │
    // │ nenhuma permissão foi conferida.                                   │
    // └────────────────────────────────────────────────────────────────────┘
    renderAt('/dashboard', { user: { ...USUARIO, role: 'ADMIN' } });

    expect(screen.getByText('conteúdo protegido')).toBeInTheDocument();
  });
});
