import { FilterX, Inbox, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * Estado vazio.
 *
 * A distinção entre os dois motivos é deliberada (docs/06-mvp-e-telas.md §6.3):
 *
 *   - `no-records`: não existe cadastro ainda. A ação útil é **cadastrar**.
 *   - `no-results`: existe cadastro, mas o filtro não devolveu nada. A ação
 *     útil é **limpar o filtro**.
 *
 * Mostrar "nenhum produto encontrado" com um botão de cadastrar para quem
 * acabou de filtrar por "parafus0" é desorientador: a pessoa acha que perdeu os
 * dados.
 */
export type EmptyStateReason = 'no-records' | 'no-results';

export interface EmptyStateProps {
  reason?: EmptyStateReason;
  title: string;
  description: string;
  icon?: LucideIcon;
  action?: ReactNode;
  className?: string;
}

const DEFAULT_ICON: Readonly<Record<EmptyStateReason, LucideIcon>> = {
  'no-records': Inbox,
  'no-results': FilterX,
};

export function EmptyState({
  reason = 'no-records',
  title,
  description,
  icon,
  action,
  className,
}: EmptyStateProps): ReactNode {
  const Icon = icon ?? DEFAULT_ICON[reason];

  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-3 px-6 py-12 text-center',
        className,
      )}
      data-reason={reason}
    >
      <div className="rounded-full bg-muted p-3">
        {/* Ícone é decorativo: o texto abaixo já diz tudo, e anunciá-lo
            duplicaria a informação no leitor de tela. */}
        <Icon aria-hidden="true" className="size-6 text-muted-foreground" />
      </div>

      <div className="flex flex-col gap-1">
        <p className="text-base font-medium">{title}</p>
        <p className="max-w-sm text-sm text-muted-foreground">{description}</p>
      </div>

      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

/** Atalho para o caso de filtro sem resultado, que sempre oferece limpar. */
export function NoResultsState({
  onClearFilters,
  className,
}: {
  onClearFilters: () => void;
  className?: string;
}): ReactNode {
  return (
    <EmptyState
      reason="no-results"
      title="Nenhum resultado para este filtro"
      description="Nenhum registro corresponde aos filtros aplicados. Ajuste ou limpe os filtros para ver os demais."
      action={
        <Button variant="outline" size="sm" onClick={onClearFilters}>
          Limpar filtros
        </Button>
      }
      {...(className !== undefined ? { className } : {})}
    />
  );
}
