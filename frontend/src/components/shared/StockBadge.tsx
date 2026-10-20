import type { ReactNode } from 'react';
import { Badge } from '@/components/ui/badge';
import type { StockStatus } from '@/lib/stock-status';
import { cn } from '@/lib/utils';

/**
 * Badge da situação de estoque.
 *
 * A regra que classifica a situação vive em `lib/stock-status.ts`: é lógica
 * pura, testável sem renderizar, e usada também por filtro e relatório.
 *
 * **Cor nunca é o único portador da informação.** Todo badge carrega rótulo em
 * texto, porque cerca de 8% dos homens têm alguma deficiência de visão de cor,
 * e porque a informação precisa sobreviver a uma impressão em preto e branco
 * (docs/06-mvp-e-telas.md §6.6).
 */
const STATUS_LABEL: Readonly<Record<StockStatus, string>> = {
  out: 'Sem estoque',
  low: 'Estoque baixo',
  ok: 'Normal',
};

const STATUS_CLASS: Readonly<Record<StockStatus, string>> = {
  out: 'bg-destructive/10 text-destructive border-destructive/20',
  low: 'bg-(--color-warning)/10 text-(--color-warning) border-(--color-warning)/25',
  ok: 'bg-muted text-muted-foreground border-transparent',
};

export interface StockBadgeProps {
  status: StockStatus;
  className?: string | undefined;
}

export function StockBadge({ status, className }: StockBadgeProps): ReactNode {
  return (
    <Badge variant="outline" className={cn('font-normal', STATUS_CLASS[status], className)}>
      {STATUS_LABEL[status]}
    </Badge>
  );
}
