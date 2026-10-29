import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  clearAccessToken,
  refreshSession,
  setAccessToken,
  setSessionExpiredHandler,
} from '@/lib/api-client';
import type { AuthContextValue, AuthUser } from '@/types/auth';
import { login as loginApi, logout as logoutApi, me as meApi, toAuthUser } from './api';
import { AuthContext } from './auth-context';

/**
 * Provedor de sessão real, contra a API (ADR-0005).
 *
 * Substitui `UiPreviewAuthProvider` (removido nesta fase): implementa o
 * mesmo `AuthContextValue`, e nenhum consumidor (sidebar, header, rotas)
 * precisou mudar além da própria substituição em `app/providers.tsx`.
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

  /**
   * Boot: a ÚNICA vez que a sessão é verificada sem ter sido pedida por
   * nenhuma ação do usuário. Recarregar a página perde o access (ele só vive
   * em memória) e dispara `POST /auth/refresh` — se houver cookie válido, a
   * sessão volta de forma transparente; se não houver, `user` permanece
   * `null` sem nenhum erro visível (não ter sessão ao abrir o app é o caso
   * normal, não uma falha).
   */
  useEffect(() => {
    const epoch = epochRef.current;
    let active = true;

    async function boot(): Promise<void> {
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

    setAccessToken(payload.accessToken);
    setUser(toAuthUser(payload.user));
  }, []);

  const signOut = useCallback((): void => {
    epochRef.current += 1;
    clearAccessToken();
    setUser(null);

    // Dispara a revogação no servidor, mas a sessão LOCAL já encerrou acima,
    // incondicionalmente — nunca espera esta chamada, e uma falha de rede
    // aqui não impede o logout de surtir efeito na interface.
    void logoutApi().catch(() => undefined);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isLoading,
      isAuthenticated: user !== null,
      signIn,
      signOut,
    }),
    [user, isLoading, signIn, signOut],
  );

  return <AuthContext value={value}>{children}</AuthContext>;
}
