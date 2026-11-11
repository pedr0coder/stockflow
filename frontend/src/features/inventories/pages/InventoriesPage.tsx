import type { SortingState } from '@tanstack/react-table';
import { ClipboardList, Plus } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { DataTable, type DataTableColumn } from '@/components/shared/DataTable';
import { PageHeader } from '@/components/shared/PageHeader';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useAuth } from '@/features/auth/auth-context';
import {
  INVENTORY_STATUSES,
  STATUS_LABEL,
  type Inventory,
  type InventoryStatusValue,
} from '@/features/inventories/api';
import { useInventoriesQuery } from '@/features/inventories/queries';
import { formatDate } from '@/lib/format';
import { toDataTableErrorState } from '@/lib/query-error';

const ALL = 'all';

const STATUS_BADGE_CLASS: Readonly<Record<InventoryStatusValue, string>> = {
  OPEN: 'bg-muted text-muted-foreground border-transparent',
  COUNTING: 'bg-(--color-warning)/10 text-(--color-warning) border-(--color-warning)/25',
  PENDING_APPROVAL: 'bg-(--color-warning)/10 text-(--color-warning) border-(--color-warning)/25',
  APPROVED: 'bg-(--color-success)/10 text-(--color-success) border-(--color-success)/25',
  CANCELLED: 'bg-destructive/10 text-destructive border-destructive/20',
};

export function InventoriesPage(): ReactNode {
  const { user } = useAuth();
  const canOpen = user?.role === 'ADMIN' || user?.role === 'MANAGER';

  const [pageIndex, setPageIndex] = useState(0);
  const [sorting, setSorting] = useState<SortingState>([{ id: 'startedAt', desc: true }]);
  const [statusFilter, setStatusFilter] = useState<InventoryStatusValue | typeof ALL>(ALL);

  const activeSort = sorting[0];
  const { data, isPending, isError, error, refetch } = useInventoriesQuery({
    page: pageIndex + 1,
    sort: activeSort?.id ?? 'startedAt',
    order: activeSort?.desc ? 'desc' : 'asc',
    ...(statusFilter !== ALL ? { status: statusFilter } : {}),
  });

  const columns: DataTableColumn<Inventory>[] = [
    {
      accessorKey: 'code',
      header: 'Código',
      enableSorting: false,
      cell: ({ row }) => (
        <Link to={`/inventories/${row.original.id}`} className="font-mono text-sm hover:underline">
          {row.original.code}
        </Link>
      ),
    },
    {
      id: 'status',
      header: 'Situação',
      enableSorting: false,
      cell: ({ row }) => (
        <Badge variant="outline" className={STATUS_BADGE_CLASS[row.original.status]}>
          {STATUS_LABEL[row.original.status]}
        </Badge>
      ),
    },
    {
      accessorKey: 'startedAt',
      header: 'Iniciado em',
      enableSorting: true,
      cell: ({ row }) => formatDate(row.original.startedAt),
    },
    {
      id: 'createdBy',
      header: 'Aberto por',
      enableSorting: false,
      cell: ({ row }) => row.original.createdBy?.name ?? '—',
    },
    {
      id: 'approvedBy',
      header: 'Aprovado por',
      enableSorting: false,
      cell: ({ row }) => row.original.approvedBy?.name ?? '—',
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Inventários"
        description="Contagens físicas e divergências apuradas."
        action={
          canOpen ? (
            <Button asChild>
              <Link to="/inventories/new">
                <Plus aria-hidden="true" className="size-4" />
                Novo inventário
              </Link>
            </Button>
          ) : undefined
        }
      />

      <Select
        value={statusFilter}
        onValueChange={(value) => {
          setStatusFilter(value as InventoryStatusValue | typeof ALL);
          setPageIndex(0);
        }}
      >
        <SelectTrigger
          size="sm"
          className="w-full sm:w-52"
          aria-label="Filtrar por situação do inventário"
        >
          <SelectValue placeholder="Situação" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>Qualquer situação</SelectItem>
          {INVENTORY_STATUSES.map((status) => (
            <SelectItem key={status} value={status}>
              {STATUS_LABEL[status]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <DataTable
        columns={columns}
        data={data?.data ?? []}
        getRowId={(row) => row.id}
        caption="Lista de inventários"
        empty={{
          title: 'Nenhum inventário aberto',
          description: 'Abra um inventário para iniciar uma contagem física.',
          icon: ClipboardList,
        }}
        renderCard={(row) => (
          <Link to={`/inventories/${row.id}`} className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between gap-2">
              <span className="font-mono text-sm font-medium hover:underline">{row.code}</span>
              <Badge variant="outline" className={STATUS_BADGE_CLASS[row.status]}>
                {STATUS_LABEL[row.status]}
              </Badge>
            </div>
            <span className="text-xs text-muted-foreground">
              Iniciado em {formatDate(row.startedAt)} · Aberto por {row.createdBy?.name ?? '—'}
            </span>
            {row.approvedBy ? (
              <span className="text-xs text-muted-foreground">
                Aprovado por {row.approvedBy.name}
              </span>
            ) : null}
          </Link>
        )}
        {...(statusFilter !== ALL
          ? {
              onClearFilters: () => {
                setStatusFilter(ALL);
                setPageIndex(0);
              },
            }
          : {})}
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
    </div>
  );
}
