import { LogOut, Menu, PanelLeftClose, PanelLeftOpen, RotateCcw, UserRound } from 'lucide-react';
import { Link } from 'react-router';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useAuth } from '@/features/auth/auth-context';
import { ROLE_LABEL } from '@/types/auth';

export interface HeaderProps {
  collapsed: boolean;
  onToggleCollapse: () => void;
  onOpenMobileNav: () => void;
}

/**
 * Cabeçalho da aplicação.
 *
 * Contém o controle de colapso da sidebar, o gatilho do drawer em tela
 * estreita, os atalhos de controle da demonstração (quando ativa) e o menu do usuário.
 */
export function Header({ collapsed, onToggleCollapse, onOpenMobileNav }: HeaderProps): ReactNode {
  const { user, signOut, resetDemoMode, exitDemoMode } = useAuth();
  const isDemo = user?.isDemo === true;

  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b bg-background px-3 sm:px-4">
      {/* Abaixo de 640px a sidebar vira drawer, e este é o gatilho. */}
      <Button
        variant="ghost"
        size="icon"
        className="sm:hidden"
        onClick={onOpenMobileNav}
        aria-label="Abrir navegação"
      >
        <Menu aria-hidden="true" className="size-5" />
      </Button>

      {/* O colapso manual só faz sentido onde cabe a sidebar completa. Entre
          640px e 1024px ela já está em modo ícone por falta de espaço. */}
      <Button
        variant="ghost"
        size="icon"
        className="hidden lg:inline-flex"
        onClick={onToggleCollapse}
        aria-label={collapsed ? 'Expandir navegação' : 'Recolher navegação'}
        aria-pressed={collapsed}
      >
        {collapsed ? (
          <PanelLeftOpen aria-hidden="true" className="size-5" />
        ) : (
          <PanelLeftClose aria-hidden="true" className="size-5" />
        )}
      </Button>

      <div className="flex-1" />

      {isDemo ? (
        <div className="flex items-center gap-1.5">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 gap-1.5 px-2.5 text-xs"
            onClick={() => {
              resetDemoMode?.();
            }}
          >
            <RotateCcw aria-hidden="true" className="size-3.5" />
            <span className="hidden md:inline">Restaurar demonstração</span>
            <span className="md:hidden">Restaurar</span>
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="hidden h-8 gap-1.5 px-2.5 text-xs text-muted-foreground hover:text-foreground sm:inline-flex"
            onClick={() => {
              (exitDemoMode ?? signOut)();
            }}
          >
            <LogOut aria-hidden="true" className="size-3.5" />
            Sair da demonstração
          </Button>
        </div>
      ) : null}

      {user ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="gap-2">
              <UserRound aria-hidden="true" className="size-4" />
              <span
                className={
                  isDemo
                    ? 'max-w-44 truncate text-xs sm:text-sm'
                    : 'sr-only sm:not-sr-only sm:inline'
                }
              >
                {user.name}
              </span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-60">
            <DropdownMenuLabel className="flex flex-col gap-0.5">
              <span className="text-sm font-medium">{user.name}</span>
              {isDemo ? (
                <span className="text-xs font-normal text-muted-foreground">
                  Alterações temporárias e isoladas nesta sessão
                </span>
              ) : (
                <>
                  <span className="text-xs font-normal text-muted-foreground">{user.email}</span>
                  <span className="text-xs font-normal text-muted-foreground">
                    {ROLE_LABEL[user.role]}
                  </span>
                </>
              )}
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            {isDemo ? (
              <>
                <DropdownMenuItem
                  onSelect={() => {
                    resetDemoMode?.();
                  }}
                >
                  <RotateCcw aria-hidden="true" className="size-4" />
                  Restaurar demonstração
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={() => {
                    (exitDemoMode ?? signOut)();
                  }}
                >
                  <LogOut aria-hidden="true" className="size-4" />
                  Sair da demonstração
                </DropdownMenuItem>
              </>
            ) : (
              <>
                {/* `/profile` existe no mapa de telas (§6.2) e não aparece na
                    sidebar: o caminho até ela é o menu do usuário. Sem este item a
                    rota ficaria órfã, alcançável só digitando a URL. */}
                <DropdownMenuItem asChild>
                  <Link to="/profile">
                    <UserRound aria-hidden="true" className="size-4" />
                    Meu perfil
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={signOut}>
                  <LogOut aria-hidden="true" className="size-4" />
                  Sair
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
    </header>
  );
}
