import type { SortingState } from '@tanstack/react-table';
import { ScrollText } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { DataTable, type DataTableColumn } from '@/components/shared/DataTable';
import { PageHeader } from '@/components/shared/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import type { AuditLog } from '@/features/audit/api';
import { useAuditQuery } from '@/features/audit/queries';
import { formatDateTime } from '@/lib/format';
import { toDataTableErrorState } from '@/lib/query-error';

export function AuditPage(): ReactNode {
  const [pageIndex, setPageIndex] = useState(0);
  const [sorting, setSorting] = useState<SortingState>([{ id: 'createdAt', desc: true }]);
  const [action, setAction] = useState('');
  const [entity, setEntity] = useState('');
  const [selected, setSelected] = useState<AuditLog | null>(null);

  const hasFilters = action.length > 0 || entity.length > 0;

  function clearFilters(): void {
    setAction('');
    setEntity('');
    setPageIndex(0);
  }

  const activeSort = sorting[0];
  const { data, isPending, isError, error, refetch } = useAuditQuery({
    page: pageIndex + 1,
    sort: activeSort?.id ?? 'createdAt',
    order: activeSort?.desc ? 'desc' : 'asc',
    ...(action.length > 0 ? { action } : {}),
    ...(entity.length > 0 ? { entity } : {}),
  });

  const columns: DataTableColumn<AuditLog>[] = [
    {
      accessorKey: 'createdAt',
      header: 'Data',
      enableSorting: true,
      cell: ({ row }) => formatDateTime(row.original.createdAt),
    },
    {
      id: 'actor',
      header: 'Autor',
      enableSorting: false,
      cell: ({ row }) => row.original.actorEmail ?? '—',
    },
    { accessorKey: 'action', header: 'Ação', enableSorting: true },
    {
      id: 'entity',
      header: 'Entidade',
      enableSorting: false,
      cell: ({ row }) =>
        row.original.entity !== null ? (
          <span className="font-mono text-xs">
            {row.original.entity}
            {row.original.entityId !== null ? ` · ${row.original.entityId.slice(0, 8)}…` : ''}
          </span>
        ) : (
          '—'
        ),
    },
    {
      id: 'details',
      header: 'Detalhes',
      enableSorting: false,
      cell: ({ row }) => (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setSelected(row.original);
          }}
        >
          Ver
        </Button>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Auditoria" description="Registro das ações relevantes do sistema." />

      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={action}
          onChange={(event) => {
            setAction(event.target.value);
            setPageIndex(0);
          }}
          placeholder="Filtrar por ação (ex.: PRODUCT_CREATED)"
          className="w-full sm:w-72"
          aria-label="Filtrar por ação"
        />
        <Input
          value={entity}
          onChange={(event) => {
            setEntity(event.target.value);
            setPageIndex(0);
          }}
          placeholder="Filtrar por entidade (ex.: Product)"
          className="w-full sm:w-56"
          aria-label="Filtrar por entidade"
        />
      </div>

      <DataTable
        columns={columns}
        data={data?.data ?? []}
        getRowId={(row) => row.id}
        caption="Registro de auditoria"
        empty={{
          title: 'Nenhum evento registrado',
          description: 'Ações relevantes do sistema aparecem aqui conforme acontecem.',
          icon: ScrollText,
        }}
        renderCard={(row) => (
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between gap-2">
              <span className="font-mono text-sm font-medium">{row.action}</span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setSelected(row);
                }}
              >
                Ver
              </Button>
            </div>
            <span className="break-all text-xs text-muted-foreground">
              {formatDateTime(row.createdAt)} · {row.actorEmail ?? '—'}
            </span>
            {row.entity !== null ? (
              <span className="font-mono text-xs text-muted-foreground">
                {row.entity}
                {row.entityId !== null ? ` · ${row.entityId.slice(0, 8)}…` : ''}
              </span>
            ) : null}
          </div>
        )}
        {...(hasFilters ? { onClearFilters: clearFilters } : {})}
        state={
          isPending
            ? { status: 'loading' }
            : isError
              ? toDataTableErrorState(error, () => void refetch())
              : { status: 'ready' }
        }
        server={{
          pageIndex,
          pageCount: data?.meta.totalPages ?? 0,
          onPageChange: setPageIndex,
          sorting,
          onSortingChange: (next) => {
            setSorting(next);
            setPageIndex(0);
          },
        }}
      />

      <Sheet
        open={selected !== null}
        onOpenChange={(open) => {
          if (!open) {
            setSelected(null);
          }
        }}
      >
        <SheetContent>
          <SheetHeader>
            <SheetTitle>{selected?.action}</SheetTitle>
            <SheetDescription>
              {selected !== null ? formatDateTime(selected.createdAt) : null}
              {selected?.actorEmail !== null && selected?.actorEmail !== undefined
                ? ` · ${selected.actorEmail}`
                : ''}
            </SheetDescription>
          </SheetHeader>

          <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-4">
            <div>
              <h3 className="mb-1 text-xs font-medium text-muted-foreground">Entidade</h3>
              <p className="font-mono text-sm">
                {selected?.entity ?? '—'} {selected?.entityId ?? ''}
              </p>
            </div>

            <div>
              <h3 className="mb-1 text-xs font-medium text-muted-foreground">Estado anterior</h3>
              <pre className="overflow-x-auto rounded-(--radius-md) border bg-muted p-3 text-xs">
                {selected?.before !== null && selected?.before !== undefined
                  ? JSON.stringify(selected.before, null, 2)
                  : 'Nenhum (criação)'}
              </pre>
            </div>

            <div>
              <h3 className="mb-1 text-xs font-medium text-muted-foreground">Estado posterior</h3>
              <pre className="overflow-x-auto rounded-(--radius-md) border bg-muted p-3 text-xs">
                {selected?.after !== null && selected?.after !== undefined
                  ? JSON.stringify(selected.after, null, 2)
                  : 'Nenhum'}
              </pre>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
