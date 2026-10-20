import { Boxes } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
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
  return (
    <>
      <aside
        className={cn(
          'hidden shrink-0 flex-col gap-4 border-r bg-background p-3 sm:flex',
          'transition-[width] duration-150',
          // Entre 640 e 1024 a largura é sempre a de ícone. Acima disso, segue
          // a escolha de quem está usando.
          collapsed ? 'w-16' : 'w-16 lg:w-60',
        )}
      >
        <BrandMark collapsed={collapsed} />
        <SidebarNav role={role} labels={collapsed ? 'hidden' : 'responsive'} />
      </aside>

      <Sheet open={mobileOpen} onOpenChange={onMobileOpenChange}>
        <SheetContent side="left" className="w-64 p-3">
          <SheetHeader className="p-0">
            <SheetTitle className="flex items-center gap-2 text-base">
              <Boxes aria-hidden="true" className="size-5 text-primary" />
              StockFlow
            </SheetTitle>
          </SheetHeader>

          <SidebarNav
            role={role}
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

function BrandMark({ collapsed }: { collapsed: boolean }): ReactNode {
  return (
    <Link
      to="/dashboard"
      className="flex items-center gap-2 rounded-(--radius-md) px-2 py-1.5 font-semibold"
    >
      <Boxes aria-hidden="true" className="size-5 shrink-0 text-primary" />
      <span className={cn('text-base', collapsed ? 'sr-only' : 'sr-only lg:not-sr-only lg:inline')}>
        StockFlow
      </span>
    </Link>
  );
}
