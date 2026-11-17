import { QueryClientContext } from '@tanstack/react-query';
import {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { toast } from 'sonner';
import {
  endDemoSession,
  formatDemoDisplayName,
  getDemoVisitorName,
  isDemoSessionActive,
  resetDemoSession,
  startDemoSession,
} from '@/features/demo/demo-sandbox';
import {
  clearAccessToken,
  refreshSession,
  setAccessToken,
  setSessionExpiredHandler,
} from '@/lib/api-client';
import type { AuthContextValue, AuthUser } from '@/types/auth';
import { login as loginApi, logout as logoutApi, me as meApi, toAuthUser } from './api';
import { AuthContext } from './auth-context';

function toDemoAuthUser(visitorName: string): AuthUser {
  return {
    id: 'demo-visitor',
    name: formatDemoDisplayName(visitorName),
    email: 'visitante@demo.stockflow.local',
    role: 'MANAGER',
    isDemo: true,
  };
}

/**
 * Provedor de sessão real, contra a API (ADR-0005), com suporte ao Modo
 * Demonstração interativo isolado no cliente (Fase 9).
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ A "geração" (`epochRef`) existe por um motivo só: um logout não pode ser  │
 * │ desfeito por uma resposta tardia de uma chamada que começou ANTES dele.   │
 * │ Toda operação assíncrona que decide `setUser` captura a geração no        │
 * │ início e a compara antes de aplicar o resultado — se mudou nesse meio      │
 * │ tempo (um `signOut` aconteceu), o resultado é descartado.                 │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export function AuthProvider({ children }: { children: ReactNode }): ReactNode {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const epochRef = useRef(0);
  const queryClient = useContext(QueryClientContext);

  /**
   * Boot: a ÚNICA vez que a sessão é verificada sem ter sido pedida por
   * nenhuma ação do usuário. Se houver uma sessão de demonstração ativa no
   * `sessionStorage` desta aba, ela é restaurada localmente sem bater na API;
   * caso contrário, tenta `POST /auth/refresh` + `GET /auth/me`.
   */
  useEffect(() => {
    const epoch = epochRef.current;
    let active = true;

    async function boot(): Promise<void> {
      const demoVisitor = getDemoVisitorName();
      if (demoVisitor !== null) {
        if (active && epochRef.current === epoch) {
          setUser(toDemoAuthUser(demoVisitor));
          setIsLoading(false);
        }
        return;
      }

      try {
        await refreshSession();
        const payload = await meApi();

        if (active && epochRef.current === epoch) {
          setUser(toAuthUser(payload));
        }
      } catch {
        if (active && epochRef.current === epoch) {
          setUser(null);
        }
      } finally {
        if (active && epochRef.current === epoch) {
          setIsLoading(false);
        }
      }
    }

    void boot();

    return () => {
      active = false;
    };
  }, []);

  /**
   * Reage a uma sessão que morreu de verdade: o interceptor de 401 do
   * `api-client` tentou renovar e o `/auth/refresh` falhou (cookie ausente,
   * expirado ou revogado). Isto NÃO é chamado em resposta a 403 — o
   * `api-client` já garante isso, nunca este provider.
   */
  useEffect(() => {
    setSessionExpiredHandler(() => {
      epochRef.current += 1;
      setUser(null);
    });

    return () => {
      setSessionExpiredHandler(null);
    };
  }, []);

  const signIn = useCallback(async (email: string, password: string): Promise<void> => {
    const epoch = epochRef.current;
    const payload = await loginApi(email, password);

    // Deslogou enquanto o login estava em voo (caso de borda, mas o mesmo
    // cuidado do boot): a resposta deste login não deve reviver a sessão.
    if (epochRef.current !== epoch) {
      return;
    }

    endDemoSession();
    setAccessToken(payload.accessToken);
    setUser(toAuthUser(payload.user));
  }, []);

  const enterDemoMode = useCallback(
    (visitorName: string): void => {
      epochRef.current += 1;
      clearAccessToken();
      const state = startDemoSession(visitorName);
      setUser(toDemoAuthUser(state.visitorName));
      setIsLoading(false);
      if (queryClient) {
        void queryClient.resetQueries();
        void queryClient.invalidateQueries({ refetchType: 'all' });
        void queryClient.refetchQueries({ type: 'all' });
      }
    },
    [queryClient],
  );

  const resetDemoMode = useCallback((): void => {
    const state = resetDemoSession();
    if (state !== null) {
      setUser(toDemoAuthUser(state.visitorName));
      if (queryClient) {
        void queryClient.resetQueries();
        void queryClient.invalidateQueries({ refetchType: 'all' });
        void queryClient.refetchQueries({ type: 'all' });
      }
      toast.success('Demonstração restaurada para os dados originais.');
    }
  }, [queryClient]);

  const exitDemoMode = useCallback((): void => {
    epochRef.current += 1;
    endDemoSession();
    clearAccessToken();
    setUser(null);
    queryClient?.clear();
  }, [queryClient]);

  const signOut = useCallback((): void => {
    const wasDemo = isDemoSessionActive();
    epochRef.current += 1;
    endDemoSession();
    clearAccessToken();
    setUser(null);
    queryClient?.clear();

    if (!wasDemo) {
      // Dispara a revogação no servidor, mas a sessão LOCAL já encerrou acima,
      // incondicionalmente — nunca espera esta chamada, e uma falha de rede
      // aqui não impede o logout de surtir efeito na interface.
      void logoutApi().catch(() => undefined);
    }
  }, [queryClient]);

  const isDemo = user?.isDemo === true;

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isLoading,
      isAuthenticated: user !== null,
      isDemo,
      signIn,
      signOut,
      enterDemoMode,
      resetDemoMode,
      exitDemoMode,
    }),
    [user, isLoading, isDemo, signIn, signOut, enterDemoMode, resetDemoMode, exitDemoMode],
  );

  return <AuthContext value={value}>{children}</AuthContext>;
}
