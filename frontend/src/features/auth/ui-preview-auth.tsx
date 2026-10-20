import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { AuthContext, UiPreviewContext } from './auth-context';
import type { AuthContextValue, AuthUser, UserRole } from '@/types/auth';

/**
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ ESTE ARQUIVO É TEMPORÁRIO E SERÁ DELETADO NA FASE 6.                     │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Pré-visualização de interface da Fase 3.
 *
 * O problema que ele resolve: a Fase 3 entrega o shell do aplicativo, e o
 * critério de aceite exige navegar por ele. Mas a autenticação real é da Fase 4
 * e a integração é da Fase 6, então não existe sessão de verdade para obter.
 *
 * O que este provider **não** faz, e é o ponto:
 *
 *   - não autentica ninguém;
 *   - não valida credencial;
 *   - não emite, guarda nem lê token;
 *   - não grava nada em `localStorage` nem em cookie;
 *   - não finge que o usuário existe.
 *
 * O usuário que ele devolve se chama "Pré-visualização" e tem endereço
 * `sem-sessao@local`, de propósito: não há como confundi-lo com uma pessoa. E
 * a interface mostra uma faixa fixa declarando que não há backend por trás.
 *
 * A sessão vive só em memória. Recarregar a página volta ao login, que é
 * exatamente o comportamento do access token real descrito no ADR-0005.
 *
 * Na Fase 6 este arquivo é **removido**, não adaptado. O `AuthProvider` real
 * implementa o mesmo `AuthContextValue` e nenhum consumidor muda.
 */

const PREVIEW_USER_BASE = {
  id: 'preview',
  name: 'Pré-visualização',
  email: 'sem-sessao@local',
} as const;

export function UiPreviewAuthProvider({ children }: { children: ReactNode }): ReactNode {
  const [user, setUser] = useState<AuthUser | null>(null);

  const startPreview = useCallback((role: UserRole) => {
    setUser({ ...PREVIEW_USER_BASE, role });
  }, []);

  const setPreviewRole = useCallback((role: UserRole) => {
    setUser((current) => (current ? { ...current, role } : null));
  }, []);

  const signOut = useCallback(() => {
    setUser(null);
  }, []);

  const auth = useMemo<AuthContextValue>(
    () => ({
      user,
      // Nunca há carregamento assíncrono aqui. Na Fase 6 este campo passa a
      // refletir a tentativa de restaurar a sessão pelo refresh token.
      isLoading: false,
      isAuthenticated: user !== null,
      signOut,
      isPreview: true,
    }),
    [user, signOut],
  );

  const previewControls = useMemo(
    () => ({ startPreview, setPreviewRole }),
    [startPreview, setPreviewRole],
  );

  return (
    <AuthContext value={auth}>
      <UiPreviewContext value={previewControls}>{children}</UiPreviewContext>
    </AuthContext>
  );
}
