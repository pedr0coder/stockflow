import {
  createCoreRowModel,
  createPaginatedRowModel,
  createSortedRowModel,
  flexRender,
  rowPaginationFeature,
  rowSortingFeature,
  tableFeatures,
  useTable,
  type ColumnDef,
  type PaginationState,
  type Row,
  type RowData,
  type SortingState,
} from '@tanstack/react-table';
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, ChevronsUpDown } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { EmptyState, NoResultsState, type EmptyStateProps } from './EmptyState';
import { ErrorState } from './ErrorState';
import { DataTableSkeleton } from './DataTableSkeleton';
import { cn } from '@/lib/utils';

/**
 * Tabela de dados do projeto.
 *
 * Construída sobre o `@tanstack/react-table`, que é **headless**: ele resolve
 * ordenação e paginação e não renderiza nada. O markup e as classes são do
 * projeto, e não impostos pela biblioteca. Foi o motivo de escolhê-la
 * (docs/06-mvp-e-telas.md §6.4).
 *
 * Os quatro estados do §6.3 estão aqui dentro, e não espalhados por cada tela
 * que usa tabela. Deixá-los a cargo de quem consome garantiria que alguma tela
 * esqueceria o estado de erro.
 *
 * Acessibilidade, que é onde tabela costuma falhar:
 *
 *   - `<caption>` descreve o conteúdo para quem usa leitor de tela, que não vê
 *     o cabeçalho da página acima;
 *   - `scope="col"` liga cada célula à sua coluna;
 *   - `aria-sort` na coluna ordenada é o que anuncia a ordenação. Sem ele, a
 *     seta é informação puramente visual;
 *   - o controle de ordenação é um `<button>` de verdade, então funciona por
 *     teclado sem `tabIndex` manual.
 */

/**
 * Funcionalidades habilitadas.
 *
 * Na versão 9 os modelos de linha entram aqui, e não nas opções do `useTable`.
 * Só entram os que o projeto usa: filtragem, agrupamento e seleção de linha
 * ficam de fora e, com isso, fora do bundle.
 */
const features = tableFeatures({
  rowSortingFeature,
  rowPaginationFeature,
  coreRowModel: createCoreRowModel(),
  sortedRowModel: createSortedRowModel(),
  paginatedRowModel: createPaginatedRowModel(),
});

/**
 * Definição de coluna já amarrada às funcionalidades acima.
 *
 * `TData extends RowData` é a restrição que a própria biblioteca exige: ela
 * garante que o tipo da linha é um objeto indexável, e é o que permite ao
 * `accessorKey` ser verificado contra as chaves reais do registro.
 */
export type DataTableColumn<TData extends RowData> = ColumnDef<typeof features, TData>;

export type DataTableStatus =
  | { status: 'loading' }
  | { status: 'error'; code?: string; requestId?: string; onRetry?: () => void }
  | { status: 'ready' };

export interface DataTableProps<TData extends RowData> {
  columns: readonly DataTableColumn<TData>[];
  data: readonly TData[];
  /** Obrigatório: identidade estável de linha, sem depender do índice. */
  getRowId: (row: TData) => string;
  /**
   * Descrição da tabela para leitor de tela. Obrigatória de propósito: uma
   * tabela sem legenda é um bloco de números sem contexto para quem não vê.
   */
  caption: string;
  state?: DataTableStatus;
  /** Conteúdo do estado vazio por ausência de cadastro. */
  empty: Pick<EmptyStateProps, 'title' | 'description' | 'icon' | 'action'>;
  /**
   * Quando informado, o vazio passa a ser tratado como filtro sem resultado e
   * oferece limpar os filtros. A distinção está explicada em `EmptyState`.
   */
  onClearFilters?: () => void;
  /** Renderização alternativa de linha em tela estreita. */
  renderCard?: (row: TData) => ReactNode;
  pageSize?: number;
  className?: string;
  /**
   * Paginação e ordenação controladas pelo servidor (Marco 6B em diante).
   *
   * Por padrão, a tabela pagina e ordena o array `data` inteiro no cliente —
   * correto quando `data` é o conjunto completo (como nas telas sem API real
   * da Fase 3). Quando `data` é só UMA página vinda do servidor, `data.length`
   * não é o total: passar `server` troca a paginação interna por uma
   * controlada por fora (`pageIndex`/`pageCount` vêm da resposta paginada da
   * API, `onPageChange`/`onSortingChange` disparam a busca da próxima
   * página/ordenação) em vez de reordenar/repaginar a página já recortada.
   */
  server?: {
    pageIndex: number;
    pageCount: number;
    onPageChange: (pageIndex: number) => void;
    sorting?: SortingState;
    onSortingChange?: (sorting: SortingState) => void;
  };
}

const DEFAULT_PAGE_SIZE = 20;

export function DataTable<TData extends RowData>({
  columns,
  data,
  getRowId,
  caption,
  state = { status: 'ready' },
  empty,
  onClearFilters,
  renderCard,
  pageSize = DEFAULT_PAGE_SIZE,
  className,
  server,
}: DataTableProps<TData>): ReactNode {
  const [localSorting, setLocalSorting] = useState<SortingState>([]);
  const [localPagination, setLocalPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize,
  });

  const sorting = server?.sorting ?? localSorting;
  const pagination: PaginationState = server
    ? { pageIndex: server.pageIndex, pageSize }
    : localPagination;

  function handleSortingChange(
    updater: SortingState | ((old: SortingState) => SortingState),
  ): void {
    const next = typeof updater === 'function' ? updater(sorting) : updater;

    if (server?.onSortingChange) {
      server.onSortingChange(next);
    } else {
      setLocalSorting(next);
    }
  }

  function handlePaginationChange(
    updater: PaginationState | ((old: PaginationState) => PaginationState),
  ): void {
    const next = typeof updater === 'function' ? updater(pagination) : updater;

    if (server) {
      server.onPageChange(next.pageIndex);
    } else {
      setLocalPagination(next);
    }
  }

  /**
   * Cópias memoizadas de `columns` e `data`.
   *
   * O `useTable` recebe arrays mutáveis, e as props aqui são `readonly`. Fazer
   * o espalhamento direto na chamada criaria uma referência nova a cada
   * renderização, e a tabela reprocessaria os dados e **perderia a página
   * atual**: clicar em "próxima" voltava para a primeira. Foi pego por teste.
   */
  const tableColumns = useMemo(() => [...columns], [columns]);
  const tableData = useMemo(() => [...data], [data]);

  const table = useTable({
    features,
    columns: tableColumns,
    data: tableData,
    getRowId,
    state: { sorting, pagination },
    onSortingChange: handleSortingChange,
    onPaginationChange: handlePaginationChange,
    ...(server ? { pageCount: server.pageCount, manualPagination: true, manualSorting: true } : {}),
  });

  if (state.status === 'loading') {
    return (
      <DataTableSkeleton
        columnCount={columns.length}
        rowCount={Math.min(pageSize, 8)}
        caption={caption}
        {...(className !== undefined ? { className } : {})}
      />
    );
  }

  if (state.status === 'error') {
    return (
      <div className={cn('rounded-(--radius-lg) border', className)}>
        <ErrorState
          {...(state.code !== undefined ? { code: state.code } : {})}
          {...(state.requestId !== undefined ? { requestId: state.requestId } : {})}
          {...(state.onRetry !== undefined ? { onRetry: state.onRetry } : {})}
        />
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className={cn('rounded-(--radius-lg) border', className)}>
        {onClearFilters ? (
          <NoResultsState onClearFilters={onClearFilters} />
        ) : (
          <EmptyState reason="no-records" {...empty} />
        )}
      </div>
    );
  }

  const rows = table.getRowModel().rows;
  const pageCount = table.getPageCount();
  const currentPage = table.state.pagination.pageIndex + 1;

  return (
    <div className={cn('flex flex-col gap-3', className)}>
      {/* Tela estreita: lista de cards. As colunas secundárias somem e o
          registro vira card com os campos principais. Rolagem horizontal em
          celular é o caminho fácil, não o correto (§6.5). */}
      {renderCard ? (
        <ul className="flex flex-col gap-2 sm:hidden">
          {rows.map((row) => (
            <li key={row.id} className="rounded-(--radius-md) border p-3">
              {renderCard(row.original)}
            </li>
          ))}
        </ul>
      ) : null}

      <div
        className={cn(
          'overflow-hidden rounded-(--radius-lg) border',
          renderCard ? 'hidden sm:block' : 'block',
        )}
      >
        <Table>
          {/* Visível só para leitor de tela: a tela já tem o título da página. */}
          <caption className="sr-only">{caption}</caption>

          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <SortableHeader key={header.id} header={header} />
                ))}
              </TableRow>
            ))}
          </TableHeader>

          <TableBody>
            {rows.map((row: Row<typeof features, TData>) => (
              <TableRow key={row.id}>
                {row.getAllCells().map((cell) => (
                  <TableCell key={cell.id}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {pageCount > 1 ? (
        <nav
          aria-label="Paginação"
          className="flex items-center justify-between gap-4 px-1 text-sm"
        >
          <p className="text-muted-foreground" aria-live="polite">
            Página {currentPage} de {pageCount}
          </p>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                table.previousPage();
              }}
              disabled={!table.getCanPreviousPage()}
            >
              <ChevronLeft aria-hidden="true" className="size-4" />
              Anterior
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                table.nextPage();
              }}
              disabled={!table.getCanNextPage()}
            >
              Próxima
              <ChevronRight aria-hidden="true" className="size-4" />
            </Button>
          </div>
        </nav>
      ) : null}
    </div>
  );
}

/**
 * Cabeçalho de coluna, com ordenação acessível.
 *
 * O `aria-sort` é o que torna a ordenação perceptível sem ver a seta. Os três
 * valores possíveis são `ascending`, `descending` e `none`, e o atributo fica
 * na célula de cabeçalho, não no botão.
 */
function SortableHeader<TData extends RowData>({
  header,
}: {
  header: ReturnType<
    ReturnType<typeof useTable<typeof features, TData>>['getHeaderGroups']
  >[number]['headers'][number];
}): ReactNode {
  const canSort = header.column.getCanSort();
  const sorted = header.column.getIsSorted();

  const ariaSort = sorted === 'asc' ? 'ascending' : sorted === 'desc' ? 'descending' : 'none';

  const content = flexRender(header.column.columnDef.header, header.getContext());

  if (!canSort) {
    return <TableHead scope="col">{content}</TableHead>;
  }

  const SortIcon = sorted === 'asc' ? ArrowUp : sorted === 'desc' ? ArrowDown : ChevronsUpDown;

  return (
    <TableHead scope="col" aria-sort={ariaSort}>
      <button
        type="button"
        onClick={header.column.getToggleSortingHandler()}
        className="-mx-2 flex items-center gap-1.5 rounded-(--radius-sm) px-2 py-1 font-medium hover:text-foreground"
      >
        {content}
        <SortIcon
          aria-hidden="true"
          className={cn('size-3.5', sorted ? 'text-foreground' : 'text-muted-foreground/60')}
        />
        <span className="sr-only">
          {sorted === 'asc'
            ? ', ordenado de forma crescente'
            : sorted === 'desc'
              ? ', ordenado de forma decrescente'
              : ', clique para ordenar'}
        </span>
      </button>
    </TableHead>
  );
}
