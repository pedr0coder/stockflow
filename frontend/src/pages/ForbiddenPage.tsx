import { ShieldAlert } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { Button } from '@/components/ui/button';

/**
 * Acesso negado por papel (403), dentro do shell autenticado.
 *
 * Existe para o `RoleGuard` (`features/auth/RoleGuard.tsx`): quem navega
 * direto para uma URL que o papel da sessão não cobre vê esta tela nomeada,
 * em vez de um redirecionamento silencioso para o dashboard — a pessoa
 * precisa entender POR QUE a página não abriu (docs/18-plano-fase-6.md
 * §18.13, decisão 3).
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ Isto é reação de INTERFACE a um papel que ela já conhece pela sessão.     │
 * │ Não é a autorização: essa é inteiramente do backend (RolesGuard), que     │
 * │ recusaria a mesma ação mesmo que esta tela nunca existisse                │
 * │ (docs/08-seguranca.md §8.3).                                              │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export function ForbiddenPage(): ReactNode {
  return (
    <div className="flex flex-col items-center justify-center gap-4 px-6 py-16 text-center">
      <div className="rounded-full bg-destructive/10 p-3">
        <ShieldAlert aria-hidden="true" className="size-6 text-destructive" />
      </div>

      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold">Acesso não permitido</h1>
        <p className="max-w-sm text-sm text-muted-foreground">
          Seu perfil não tem permissão para acessar esta página.
        </p>
      </div>

      <Button asChild variant="outline" size="sm">
        <Link to="/dashboard">Ir para o dashboard</Link>
      </Button>
    </div>
  );
}
