import type { ReactNode } from 'react';
import { Outlet } from 'react-router';
import { ForbiddenPage } from '@/pages/ForbiddenPage';
import type { UserRole } from '@/types/auth';
import { useAuth } from './auth-context';

export interface RoleGuardProps {
  /** Papéis autorizados a ver a rota. Os demais recebem `ForbiddenPage`. */
  roles: readonly UserRole[];
}

/**
 * Protege uma rota por papel — CONVENIÊNCIA DE INTERFACE, não autorização.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ Esconder ou bloquear a navegação para esta tela não protege nenhum dado:  │
 * │ a API é chamável direto, sem passar por aqui, e é ELA que decide por      │
 * │ `RolesGuard` (docs/08-seguranca.md §8.3). O único papel deste componente  │
 * │ é não deixar alguém abrir uma tela cujas chamadas a API já vai recusar —  │
 * │ e explicar por quê, em vez de deixar a tela quebrada tentar e falhar.     │
 * │                                                                          │
 * │ Se este componente for um dia a ÚNICA coisa impedindo um papel de         │
 * │ executar uma ação de outro, o sistema está inseguro (mesmo aviso de       │
 * │ `lib/nav-items.ts`).                                                      │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Fica DENTRO de `ProtectedRoute` na árvore de rotas: por aqui já se sabe que
 * há sessão (`ProtectedRoute` garante isso antes). Este componente só decide
 * se o PAPEL daquela sessão serve para a rota.
 */
export function RoleGuard({ roles }: RoleGuardProps): ReactNode {
  const { user } = useAuth();

  // `ProtectedRoute`, por construção, já garantiu que há sessão antes de este
  // componente montar. Se `user` for `null` aqui, é um erro de composição de
  // rotas (`RoleGuard` usado fora de `ProtectedRoute`) — falhar visível é
  // melhor que esconder o caso atrás de uma tela de acesso negado que não é
  // o motivo real.
  if (!user) {
    throw new Error('RoleGuard precisa estar dentro de uma rota protegida por sessão.');
  }

  if (!roles.includes(user.role)) {
    return <ForbiddenPage />;
  }

  return <Outlet />;
}
