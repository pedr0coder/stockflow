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
}

const TONE_CLASS: Readonly<Record<NonNullable<StatCardProps['tone']>, string>> = {
  default: 'text-foreground',
  warning: 'text-(--color-warning)',
  danger: 'text-destructive',
};

export function StatCard({
  label,
  icon: Icon,
  state,
  tone = 'default',
  className,
}: StatCardProps): ReactNode {
  return (
    // Card estático recebe borda, não sombra. Ver §6.4.
    <Card className={cn('border shadow-none', className)}>
      <CardContent className="flex flex-col gap-3 p-5">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-medium text-muted-foreground">{label}</span>
          <Icon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
        </div>

        {state.status === 'loading' ? (
          <div aria-busy="true" aria-live="polite">
            <span className="sr-only">Carregando {label}</span>
            <Skeleton className="h-8 w-24" />
          </div>
        ) : null}

        {state.status === 'empty' ? (
          <p className="text-sm text-muted-foreground">{state.reason}</p>
        ) : null}

        {state.status === 'ready' ? (
          <div className="flex flex-col gap-0.5">
            <span className={cn('font-mono text-2xl font-semibold', TONE_CLASS[tone])}>
              {state.value}
            </span>
            {state.hint ? (
              <span className="text-xs text-muted-foreground">{state.hint}</span>
            ) : null}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
