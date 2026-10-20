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
 * Esta é a forma **final**, que a Fase 6 vai implementar contra a API real. Na
 * Fase 3 existe uma implementação de pré-visualização de interface
 * (`ui-preview-auth.tsx`) que satisfaz este mesmo contrato sem autenticar
 * ninguém. Trocar uma pela outra não deve exigir mudança em nenhum consumidor.
 */
export interface AuthContextValue {
  user: AuthUser | null;
  /** Verdadeiro enquanto a sessão ainda não foi determinada. */
  isLoading: boolean;
  /** Verdadeiro quando há sessão. */
  isAuthenticated: boolean;
  signOut: () => void;
  /**
   * Identifica a implementação de pré-visualização.
   *
   * Existe para que a interface possa declarar com honestidade que não há
   * backend por trás. Sai do contrato quando a autenticação real entrar.
   */
  isPreview: boolean;
}
