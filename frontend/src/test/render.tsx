import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, type RenderResult } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router';
import { Toaster } from '@/components/ui/sonner';
import { AuthContext } from '@/features/auth/auth-context';
import type { AuthContextValue, AuthUser } from '@/types/auth';

/**
 * Renderiza um componente dentro de um roteador em memória.
 *
 * Serve a componentes que usam `NavLink`, `Link` ou hooks de rota e que, fora
 * de um roteador, lançariam. O roteador é real, não um duplo: o que se quer
 * testar é o comportamento com a biblioteca que roda em produção.
 *
 * O arquivo guarda **apenas** o que algum teste usa. Auxiliar de teste sem uso
 * é código morto como qualquer outro, e envelhece pior, porque ninguém o
 * executa para perceber que quebrou.
 */
export function renderWithRouter(
  ui: ReactNode,
  { route = '/' }: { route?: string } = {},
): RenderResult {
  return render(<MemoryRouter initialEntries={[route]}>{ui}</MemoryRouter>);
}

const DEFAULT_TEST_USER: AuthUser = {
  id: 'u1',
  name: 'Pessoa de Teste',
  email: 'teste@stockflow.local',
  role: 'ADMIN',
};

/**
 * `QueryClient` para teste: sem retry e sem `gcTime`, para que uma mutação ou
 * consulta que falha não force o teste a esperar a política de retentativa de
 * produção (`staleTime`/`retry` reais ficam em `app/providers.tsx`).
 */
export function createTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
}

/**
 * Renderiza com `QueryClientProvider` + `MemoryRouter` + `AuthContext`, para
 * as telas de domínio (categorias, fornecedores, produtos, dashboard) que
 * precisam das três coisas ao mesmo tempo. `renderWithRouter` continua
 * existindo para quem só precisa do roteador.
 */
export function renderWithProviders(
  ui: ReactNode,
  {
    route = '/',
    user = DEFAULT_TEST_USER,
    queryClient = createTestQueryClient(),
  }: { route?: string; user?: AuthUser | null; queryClient?: QueryClient } = {},
): RenderResult {
  const authValue: AuthContextValue = {
    user,
    isLoading: false,
    isAuthenticated: user !== null,
    signIn: () => Promise.resolve(),
    signOut: () => undefined,
  };

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[route]}>
        <AuthContext value={authValue}>
          {ui}
          <Toaster position="bottom-right" />
        </AuthContext>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
