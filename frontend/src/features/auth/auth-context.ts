import { createContext, useContext } from 'react';
import type { AuthContextValue } from '@/types/auth';

/**
 * Contexto de sessão.
 *
 * Arquivo `.ts` e não `.tsx` de propósito: ele não exporta componente, só o
 * contexto e o hook. Separar assim mantém o Fast Refresh do Vite funcionando
 * nos arquivos que exportam componente, e é o que a regra
 * `react-refresh/only-export-components` cobra.
 *
 * O valor inicial é `null` para que usar o hook fora do provider falhe alto, em
 * vez de devolver um objeto vazio que só quebra três telas adiante.
 */
export const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error('useAuth precisa estar dentro de um provider de autenticação.');
  }

  return context;
}
