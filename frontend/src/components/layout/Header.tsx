import { LogOut, Menu, PanelLeftClose, PanelLeftOpen, UserRound } from 'lucide-react';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useAuth, useUiPreview } from '@/features/auth/auth-context';
import { ROLE_LABEL, USER_ROLES, type UserRole } from '@/types/auth';

export interface HeaderProps {
  collapsed: boolean;
  onToggleCollapse: () => void;
  onOpenMobileNav: () => void;
}

/**
 * Cabeçalho da aplicação.
 *
 * Contém o controle de colapso da sidebar, o gatilho do drawer em tela
 * estreita, o menu do usuário e, enquanto a Fase 3 durar, o seletor de papel da
 * pré-visualização.
 */
export function Header({ collapsed, onToggleCollapse, onOpenMobileNav }: HeaderProps): ReactNode {
  const { user, signOut, isPreview } = useAuth();

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

      {isPreview ? <PreviewRoleSelect /> : null}

      {user ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="gap-2">
              <UserRound aria-hidden="true" className="size-4" />
              <span className="hidden sm:inline">{user.name}</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel className="flex flex-col gap-0.5">
              <span className="text-sm font-medium">{user.name}</span>
              <span className="text-xs font-normal text-muted-foreground">{user.email}</span>
              <span className="text-xs font-normal text-muted-foreground">
                {ROLE_LABEL[user.role]}
              </span>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
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
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
    </header>
  );
}

/**
 * Seletor de papel da pré-visualização.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ SERÁ DELETADO NA FASE 6.                                                 │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Trocar o papel aqui **não concede permissão nenhuma**: muda apenas quais
 * itens a sidebar mostra, que é o comportamento de interface entregue nesta
 * fase. É também como esse comportamento fica demonstrável sem backend.
 */
function PreviewRoleSelect(): ReactNode {
  const { user } = useAuth();
  const { setPreviewRole } = useUiPreview();

  if (!user) {
    return null;
  }

  return (
    <div className="flex items-center gap-2">
      <label htmlFor="preview-role" className="hidden text-xs text-muted-foreground sm:inline">
        Ver como
      </label>
      <Select
        value={user.role}
        onValueChange={(value) => {
          setPreviewRole(value as UserRole);
        }}
      >
        <SelectTrigger id="preview-role" size="sm" className="w-36">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {USER_ROLES.map((role) => (
            <SelectItem key={role} value={role}>
              {ROLE_LABEL[role]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
