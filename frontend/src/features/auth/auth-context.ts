import { createContext, useContext } from 'react';
import type { AuthContextValue, UserRole } from '@/types/auth';

/**
 * Contexto de sessão.
 *
 * Arquivo `.ts` e não `.tsx` de propósito: ele não exporta componente, só o
 * contexto e os hooks. Separar assim mantém o Fast Refresh do Vite funcionando
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

/**
 * Extensão usada **apenas** pela pré-visualização de interface da Fase 3.
 *
 * Fica separada do contrato real (`AuthContextValue`) para que nenhuma tela de
 * negócio dependa dela por engano. Some junto com a pré-visualização na Fase 6.
 */
export interface UiPreviewControls {
  startPreview: (role: UserRole) => void;
  setPreviewRole: (role: UserRole) => void;
}

export const UiPreviewContext = createContext<UiPreviewControls | null>(null);

export function useUiPreview(): UiPreviewControls {
  const context = useContext(UiPreviewContext);

  if (!context) {
    throw new Error('useUiPreview precisa estar dentro do provider de pré-visualização.');
  }

  return context;
}
