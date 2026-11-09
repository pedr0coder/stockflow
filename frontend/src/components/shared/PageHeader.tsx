import { ChevronRight } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { cn } from '@/lib/utils';

export interface Breadcrumb {
  label: string;
  /** Ausente no item atual, que não é link. */
  to?: string;
}

export interface PageHeaderProps {
  title: string;
  description?: string;
  breadcrumbs?: readonly Breadcrumb[];
  /** Ação primária da tela, à direita do título. */
  action?: ReactNode;
  className?: string;
}

/**
 * Cabeçalho de tela: breadcrumb, título, descrição e ação primária.
 *
 * Padroniza o topo de toda tela para que a hierarquia visual seja a mesma em
 * todas elas, e para que a ação primária esteja sempre no mesmo lugar.
 */
export function PageHeader({
  title,
  description,
  breadcrumbs,
  action,
  className,
}: PageHeaderProps): ReactNode {
  return (
    <header className={cn('flex flex-col gap-4', className)}>
      {breadcrumbs && breadcrumbs.length > 0 ? (
        <nav aria-label="Trilha de navegação">
          <ol className="flex flex-wrap items-center gap-1 text-sm text-muted-foreground">
            {breadcrumbs.map((crumb, index) => {
              const isLast = index === breadcrumbs.length - 1;

              return (
                <li key={`${crumb.label}-${String(index)}`} className="flex items-center gap-1">
                  {crumb.to && !isLast ? (
                    <Link
                      to={crumb.to}
                      className="rounded-sm hover:text-foreground hover:underline"
                    >
                      {crumb.label}
                    </Link>
                  ) : (
                    // `aria-current` diz ao leitor de tela qual item é a página
                    // atual, sem depender de pista visual.
                    <span aria-current={isLast ? 'page' : undefined} className="text-foreground">
                      {crumb.label}
                    </span>
                  )}
                  {!isLast ? <ChevronRight aria-hidden="true" className="size-3.5" /> : null}
                </li>
              );
            })}
          </ol>
        </nav>
      ) : null}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          {description ? (
            <p className="max-w-2xl text-sm text-muted-foreground">{description}</p>
          ) : null}
        </div>

        {action ? (
          <div className="flex flex-wrap items-center gap-2 sm:shrink-0">{action}</div>
        ) : null}
      </div>
    </header>
  );
}
