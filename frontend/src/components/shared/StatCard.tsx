import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

/**
 * Indicador do dashboard.
 *
 * Os três estados existem porque o indicador tem três situações reais, e cada
 * uma precisa de tratamento próprio (docs/06-mvp-e-telas.md §6.3):
 *
 *   - `loading`: a consulta está em andamento. Skeleton com a forma do valor.
 *   - `empty`:   a consulta voltou sem dado. Diz que não há, **não mostra zero**.
 *   - `ready`:   há valor real para mostrar.
 *
 * A distinção entre `empty` e um valor zero é a parte que importa. "0 produtos
 * em estoque" é uma informação: alguém conferiu e o saldo é zero. Um indicador
 * vazio porque ainda não há movimentação registrada é outra coisa, e exibir
 * "0" nesse caso seria inventar um fato.
 */
export type StatCardState =
  | { status: 'loading' }
  | { status: 'empty'; reason: string }
  | { status: 'ready'; value: string; hint?: string };

export interface StatCardProps {
  label: string;
  icon: LucideIcon;
  state: StatCardState;
  /** Destaque semântico do valor. Acompanhado de texto, nunca cor sozinha. */
  tone?: 'default' | 'warning' | 'danger';
  className?: string;
  /** Descrição auxiliar exibida abaixo do valor (quando hint não estiver no state). */
  description?: string;
}

const TONE_VALUE_CLASS: Readonly<Record<NonNullable<StatCardProps['tone']>, string>> = {
  default: 'text-foreground',
  warning: 'text-amber-600 dark:text-amber-400',
  danger: 'text-rose-600 dark:text-rose-400',
};

const TONE_ICON_CONTAINER: Readonly<Record<NonNullable<StatCardProps['tone']>, string>> = {
  default: 'bg-primary/10 text-primary border-primary/20',
  warning: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20',
  danger: 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20',
};

const TONE_CARD_BORDER: Readonly<Record<NonNullable<StatCardProps['tone']>, string>> = {
  default: 'border-t-2 border-t-primary/70',
  warning: 'border-t-2 border-t-amber-500',
  danger: 'border-t-2 border-t-rose-500',
};

export function StatCard({
  label,
  icon: Icon,
  state,
  tone = 'default',
  className,
  description,
}: StatCardProps): ReactNode {
  return (
    <Card
      className={cn(
        'relative overflow-hidden border bg-card shadow-xs transition-colors hover:border-foreground/20',
        TONE_CARD_BORDER[tone],
        className,
      )}
    >
      <CardContent className="flex flex-col justify-between gap-4 p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-col gap-1">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {label}
            </span>
          </div>
          <div
            className={cn(
              'flex size-9 shrink-0 items-center justify-center rounded-lg border',
              TONE_ICON_CONTAINER[tone],
            )}
          >
            <Icon aria-hidden="true" className="size-4.5" />
          </div>
        </div>

        {state.status === 'loading' ? (
          <div aria-busy="true" aria-live="polite" className="flex flex-col gap-2 pt-1">
            <span className="sr-only">Carregando {label}</span>
            <Skeleton className="h-9 w-28" />
            <Skeleton className="h-4 w-36" />
          </div>
        ) : null}

        {state.status === 'empty' ? (
          <div className="pt-1">
            <p className="text-sm text-muted-foreground">{state.reason}</p>
          </div>
        ) : null}

        {state.status === 'ready' ? (
          <div className="flex flex-col gap-1 pt-0.5">
            <span
              className={cn('font-mono text-3xl font-bold tracking-tight', TONE_VALUE_CLASS[tone])}
            >
              {state.value}
            </span>
            {(state.hint ?? description) ? (
              <span className="text-xs text-muted-foreground">{state.hint ?? description}</span>
            ) : null}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
