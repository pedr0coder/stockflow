import { Boxes } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { Badge } from '@/components/ui/badge';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { useAuth } from '@/features/auth/auth-context';
import { SidebarNav } from './SidebarNav';
import type { UserRole } from '@/types/auth';
import { cn } from '@/lib/utils';

export interface SidebarProps {
  role: UserRole;
  collapsed: boolean;
  mobileOpen: boolean;
  onMobileOpenChange: (open: boolean) => void;
}

/**
 * Sidebar em três comportamentos, conforme a faixa de largura (§6.5):
 *
 *   `< 640px`     oculta; a navegação vira drawer, aberto pelo cabeçalho
 *   `640–1024px`  visível em modo ícone, porque não cabe o rótulo
 *   `> 1024px`    completa, e quem usa pode recolher para o modo ícone
 *
 * As três larguras estão no mesmo componente de propósito: duplicar a
 * navegação em dois componentes garantiria que um deles ficaria desatualizado.
 */
export function Sidebar({
  role,
  collapsed,
  mobileOpen,
  onMobileOpenChange,
}: SidebarProps): ReactNode {
  const { user } = useAuth();
  const isDemo = user?.isDemo === true;

  return (
    <>
      <aside
        className={cn(
          'hidden shrink-0 flex-col gap-4 border-r bg-background p-3 sm:flex',
          'transition-[width] duration-150 motion-reduce:transition-none',
          // Entre 640 e 1024 a largura é sempre a de ícone. Acima disso, segue
          // a escolha de quem está usando.
          collapsed ? 'w-16' : 'w-16 lg:w-60',
        )}
      >
        <BrandMark collapsed={collapsed} isDemo={isDemo} />
        <SidebarNav role={role} isDemo={isDemo} labels={collapsed ? 'hidden' : 'responsive'} />
      </aside>

      <Sheet open={mobileOpen} onOpenChange={onMobileOpenChange}>
        <SheetContent side="left" className="w-64 p-3">
          <SheetHeader className="p-0">
            <SheetTitle className="flex flex-wrap items-center gap-2 text-base">
              <Boxes aria-hidden="true" className="size-5 text-primary" />
              <span>StockFlow</span>
              {isDemo ? (
                <Badge
                  variant="outline"
                  className="border-primary/30 bg-primary/10 px-1.5 py-0 text-[10px] font-medium text-primary"
                >
                  Modo demonstração
                </Badge>
              ) : null}
            </SheetTitle>
            <SheetDescription className="sr-only">Menu de navegação principal</SheetDescription>
          </SheetHeader>

          <SidebarNav
            role={role}
            isDemo={isDemo}
            // O drawer tem 256px só para a navegação: o rótulo sempre cabe.
            labels="visible"
            onNavigate={() => {
              // Fecha o drawer ao navegar: deixá-lo aberto sobre a tela nova
              // obrigaria um toque extra a cada navegação.
              onMobileOpenChange(false);
            }}
          />
        </SheetContent>
      </Sheet>
    </>
  );
}

function BrandMark({ collapsed, isDemo }: { collapsed: boolean; isDemo: boolean }): ReactNode {
  return (
    <div className="flex flex-col gap-1">
      <Link
        to="/dashboard"
        className="relative flex items-center gap-2 rounded-(--radius-md) px-2 py-1.5 font-semibold"
        title={isDemo ? 'StockFlow — Modo demonstração' : 'StockFlow'}
      >
        <Boxes aria-hidden="true" className="size-5 shrink-0 text-primary" />
        <span
          className={cn('text-base', collapsed ? 'sr-only' : 'sr-only lg:not-sr-only lg:inline')}
        >
          StockFlow
        </span>
        {isDemo ? (
          <span
            aria-hidden="true"
            className={cn(
              'size-2 shrink-0 rounded-full bg-primary',
              collapsed ? 'inline-block' : 'inline-block lg:hidden',
            )}
          />
        ) : null}
      </Link>

      {isDemo ? (
        <div className={cn('px-2', collapsed ? 'sr-only' : 'sr-only lg:not-sr-only lg:block')}>
          <Badge
            variant="outline"
            className="border-primary/30 bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary"
          >
            Modo demonstração
          </Badge>
        </div>
      ) : null}
    </div>
  );
}
