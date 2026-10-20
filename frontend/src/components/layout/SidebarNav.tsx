import type { ReactNode } from 'react';
import { NavLink } from 'react-router';
import { navGroupsForRole } from '@/lib/nav-items';
import type { UserRole } from '@/types/auth';
import { cn } from '@/lib/utils';

/**
 * Visibilidade do rótulo de cada item.
 *
 * Três valores e não um booleano `collapsed`, porque são três situações
 * distintas, e tratá-las como duas produziu um defeito real: o drawer de
 * celular recebia `collapsed: false`, herdava a regra responsiva do modo
 * desktop (`hidden lg:inline`) e, abaixo de 1024px, ficava só com ícones,
 * mesmo tendo largura de sobra.
 *
 *   `visible`     sempre mostra. É o caso do drawer, que tem 256px só para si.
 *   `responsive`  mostra a partir de 1024px. É a sidebar fixa, que entre 640 e
 *                 1024 não tem largura para o rótulo.
 *   `hidden`      nunca mostra. É o modo ícone escolhido por quem está usando.
 *
 * Em `responsive` e `hidden` o texto continua no DOM como `sr-only`: o leitor
 * de tela anuncia o nome do item independentemente do espaço na tela.
 */
export type NavLabelVisibility = 'visible' | 'responsive' | 'hidden';

export interface SidebarNavProps {
  role: UserRole;
  labels: NavLabelVisibility;
  /** Chamado ao navegar, para o drawer fechar em tela estreita. */
  onNavigate?: () => void;
}

const LABEL_CLASS: Readonly<Record<NavLabelVisibility, string>> = {
  visible: 'inline',
  responsive: 'sr-only lg:not-sr-only lg:inline',
  hidden: 'sr-only',
};

const GROUP_TITLE_CLASS: Readonly<Record<NavLabelVisibility, string>> = {
  visible: 'block',
  responsive: 'sr-only lg:not-sr-only lg:block',
  hidden: 'sr-only',
};

/**
 * Navegação lateral, filtrada pelo papel do usuário.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ A filtragem por papel aqui é CONVENIÊNCIA DE INTERFACE, NÃO AUTORIZAÇÃO. │
 * │                                                                          │
 * │ Ela existe para não oferecer a alguém um caminho que terminaria em 403,  │
 * │ o que é frustrante. Não existe para proteger nada.                       │
 * │                                                                          │
 * │ Quem quiser acessar a rota digita a URL, e quem quiser chamar a API usa  │
 * │ curl sem passar por esta tela. A proteção real é o guard no servidor,    │
 * │ verificado por requisição (docs/08-seguranca.md §8.3), e é entrega da    │
 * │ Fase 4.                                                                  │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export function SidebarNav({ role, labels, onNavigate }: SidebarNavProps): ReactNode {
  const groups = navGroupsForRole(role);
  const iconOnly = labels === 'hidden';

  return (
    <nav aria-label="Navegação principal" className="flex flex-1 flex-col gap-5 overflow-y-auto">
      {groups.map((group) => (
        <div key={group.label ?? 'principal'} className="flex flex-col gap-1">
          {group.label ? (
            <h2
              className={cn(
                'px-3 text-xs font-medium tracking-wide text-muted-foreground uppercase',
                GROUP_TITLE_CLASS[labels],
              )}
            >
              {group.label}
            </h2>
          ) : null}

          <ul className="flex flex-col gap-0.5">
            {group.items.map((item) => {
              const Icon = item.icon;

              return (
                <li key={item.to}>
                  <NavLink
                    to={item.to}
                    onClick={onNavigate}
                    className={({ isActive }) =>
                      cn(
                        'flex items-center gap-3 rounded-(--radius-md) px-3 py-2 text-sm transition-colors',
                        'hover:bg-muted',
                        isActive ? 'bg-muted font-medium text-foreground' : 'text-muted-foreground',
                        iconOnly && 'justify-center px-2',
                        labels === 'responsive' && 'justify-center px-2 lg:justify-start lg:px-3',
                      )
                    }
                  >
                    {({ isActive }) => (
                      <>
                        <Icon aria-hidden="true" className="size-4 shrink-0" />
                        <span className={LABEL_CLASS[labels]}>{item.label}</span>
                        {/* Estado ativo anunciado por texto, porque no modo
                            ícone não há pista visual de rótulo. */}
                        {isActive ? <span className="sr-only">(página atual)</span> : null}
                      </>
                    )}
                  </NavLink>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
