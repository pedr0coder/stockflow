import { Loader2 } from 'lucide-react';
import type { ReactNode } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router';
import { useAuth } from './auth-context';

/**
 * Rota que exige sessão.
 *
 * Três estados, e o primeiro é o que costuma ser esquecido:
 *
 *   `isLoading`  a sessão ainda não foi determinada. Redirecionar aqui faria a
 *                tela de login piscar em toda recarga de página, antes de a
 *                restauração da sessão terminar. Na Fase 6 esse carregamento
 *                será a chamada de `POST /auth/refresh` no boot (ADR-0005).
 *   sem sessão   redireciona para `/login`, guardando de onde veio para
 *                devolver a pessoa ao destino depois de entrar.
 *   com sessão   renderiza a rota.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ Isto é controle de NAVEGAÇÃO, não de acesso.                             │
 * │                                                                          │
 * │ Evita que alguém sem sessão veja uma tela que não vai funcionar. Não     │
 * │ protege dado nenhum: o dado vem da API, e é lá que a autorização é       │
 * │ verificada (docs/08-seguranca.md §8.3).                                  │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export function ProtectedRoute(): ReactNode {
  const { isAuthenticated, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="flex min-h-dvh items-center justify-center" role="status" aria-live="polite">
        <Loader2 aria-hidden="true" className="size-5 animate-spin text-muted-foreground" />
        <span className="sr-only">Verificando sessão</span>
      </div>
    );
  }

  if (!isAuthenticated) {
    // `replace` para que o botão voltar do navegador não traga de volta a rota
    // protegida, criando um laço de redirecionamento.
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  return <Outlet />;
}
