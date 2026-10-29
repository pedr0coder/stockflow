/**
 * Tipos de sessão e papel.
 *
 * Espelham o enum `UserRole` do banco (docs/04-banco-de-dados.md §4.3). São
 * declarados aqui, e não gerados, porque o frontend e o backend são
 * deployáveis de forma independente (ADR-0002): compartilhar tipo entre eles
 * criaria acoplamento de build para economizar poucas linhas.
 */

export const USER_ROLES = ['ADMIN', 'MANAGER', 'OPERATOR'] as const;

export type UserRole = (typeof USER_ROLES)[number];

/** Rótulo em português, para exibição. */
export const ROLE_LABEL: Readonly<Record<UserRole, string>> = {
  ADMIN: 'Administrador',
  MANAGER: 'Gerente',
  OPERATOR: 'Operador',
};

/**
 * Usuário da sessão.
 *
 * Note o que **não** está aqui: nenhum token. O access token vive em memória no
 * cliente de API e nunca passa pelo estado de interface (ADR-0005).
 */
export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
}

/**
 * Contrato do provedor de autenticação.
 *
 * Forma final, implementada pela Fase 6 (`features/auth/auth-provider.tsx`) contra a API
 * real. Até a Fase 5, existiu uma implementação de pré-visualização de interface
 * (`ui-preview-auth.tsx`, removida nesta fase) que satisfazia um contrato parecido sem
 * autenticar ninguém — o campo `isPreview` que a distinguia saiu daqui porque não há mais
 * nada para distinguir.
 */
export interface AuthContextValue {
  user: AuthUser | null;
  /** Verdadeiro enquanto a sessão ainda não foi determinada (boot: refresh + /me em andamento). */
  isLoading: boolean;
  /** Verdadeiro quando há sessão. */
  isAuthenticated: boolean;
  /**
   * Autentica contra `POST /auth/login`. Lança `ApiError` em credencial
   * inválida — quem chama decide a mensagem (a tela de login, com contexto).
   */
  signIn: (email: string, password: string) => Promise<void>;
  /**
   * Encerra a sessão local e revoga no servidor. Nunca lança: mesmo se
   * `POST /auth/logout` falhar (rede fora do ar), a sessão LOCAL sempre
   * encerra — o cookie no servidor expira pelo próprio TTL se a chamada não
   * chegou.
   */
  signOut: () => void;
}
