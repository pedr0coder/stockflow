import { ArrowDownLeft, ArrowUpRight, Scale } from 'lucide-react';
import type { ComponentType, ReactNode } from 'react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

/**
 * Tipo de movimentação de estoque.
 *
 * Espelha o enum `MovementType` do banco (docs/04-banco-de-dados.md §4.3).
 * Semântica de cor conforme §6.4: entrada em success, saída em danger, ajuste
 * em warning.
 *
 * Como no `StockBadge`, a cor acompanha rótulo em texto e ícone, nunca sozinha.
 * O ícone é redundante de propósito: direção é mais rápida de ler que palavra,
 * e sobrevive a quem não distingue verde de vermelho.
 */
export type MovementType = 'IN' | 'OUT' | 'ADJUSTMENT';

const TYPE_LABEL: Readonly<Record<MovementType, string>> = {
  IN: 'Entrada',
  OUT: 'Saída',
  ADJUSTMENT: 'Ajuste',
};

const TYPE_ICON: Readonly<Record<MovementType, ComponentType<{ className?: string }>>> = {
  IN: ArrowDownLeft,
  OUT: ArrowUpRight,
  ADJUSTMENT: Scale,
};

const TYPE_CLASS: Readonly<Record<MovementType, string>> = {
  IN: 'bg-(--color-success)/10 text-(--color-success) border-(--color-success)/25',
  OUT: 'bg-destructive/10 text-destructive border-destructive/20',
  ADJUSTMENT: 'bg-(--color-warning)/10 text-(--color-warning) border-(--color-warning)/25',
};

export interface MovementTypeBadgeProps {
  type: MovementType;
  className?: string;
}

export function MovementTypeBadge({ type, className }: MovementTypeBadgeProps): ReactNode {
  const Icon = TYPE_ICON[type];

  return (
    <Badge variant="outline" className={cn('gap-1 font-normal', TYPE_CLASS[type], className)}>
      <Icon aria-hidden="true" className="size-3" />
      {TYPE_LABEL[type]}
    </Badge>
  );
}
