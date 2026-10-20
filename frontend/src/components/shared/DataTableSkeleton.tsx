import type { ReactNode } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';

export interface DataTableSkeletonProps {
  columnCount: number;
  rowCount?: number;
  caption: string;
  className?: string;
}

/**
 * Estado de carregamento da tabela.
 *
 * Skeleton **com a forma do conteúdo real**, não um spinner centralizado
 * (docs/06-mvp-e-telas.md §6.3). A diferença é concreta: o skeleton ocupa o
 * mesmo espaço que a tabela vai ocupar, então a página não salta quando os
 * dados chegam. Um spinner no meio da tela deixa o layout mudar embaixo do
 * cursor da pessoa.
 *
 * `aria-busy` e a descrição em `sr-only` informam a quem usa leitor de tela
 * que há carregamento em andamento, já que a animação é informação puramente
 * visual.
 */
export function DataTableSkeleton({
  columnCount,
  rowCount = 8,
  caption,
  className,
}: DataTableSkeletonProps): ReactNode {
  const columns = Array.from({ length: columnCount }, (_, index) => index);
  const rows = Array.from({ length: rowCount }, (_, index) => index);

  return (
    <div
      className={cn('overflow-hidden rounded-(--radius-lg) border', className)}
      aria-busy="true"
      aria-live="polite"
    >
      <Table>
        <caption className="sr-only">Carregando {caption}</caption>

        <TableHeader>
          <TableRow>
            {columns.map((column) => (
              <TableHead key={column} scope="col">
                <Skeleton className="h-4 w-24" />
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>

        <TableBody>
          {rows.map((row) => (
            <TableRow key={row}>
              {columns.map((column) => (
                <TableCell key={column}>
                  {/* Larguras alternadas para que a linha não pareça um bloco
                      sólido, que é o que faz skeleton parecer erro de render. */}
                  <Skeleton className={column === 0 ? 'h-4 w-40' : 'h-4 w-20'} />
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
