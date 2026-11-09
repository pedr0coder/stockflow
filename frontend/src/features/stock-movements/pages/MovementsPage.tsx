import type { SortingState } from '@tanstack/react-table';
import { Boxes, Plus } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { DataTable, type DataTableColumn } from '@/components/shared/DataTable';
import { MovementTypeBadge } from '@/components/shared/MovementTypeBadge';
import { PageHeader } from '@/components/shared/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useAuth } from '@/features/auth/auth-context';
import { ProductPicker } from '@/features/products/components/ProductPicker';
import type { Product } from '@/features/products/api';
import {
  MOVEMENT_REASONS,
  REASON_LABEL,
  type Movement,
  type MovementReasonValue,
  type MovementTypeValue,
} from '@/features/stock-movements/api';
import { useMovementsQuery } from '@/features/stock-movements/queries';
import { formatDateTime, formatQuantity } from '@/lib/format';
import { toDataTableErrorState } from '@/lib/query-error';

const ALL = 'all';

export function MovementsPage(): ReactNode {
  const { user } = useAuth();
  const canAdjust = user?.role === 'ADMIN' || user?.role === 'MANAGER';

  const [pageIndex, setPageIndex] = useState(0);
  const [sorting, setSorting] = useState<SortingState>([{ id: 'createdAt', desc: true }]);
  const [product, setProduct] = useState<Product | null>(null);
  const [typeFilter, setTypeFilter] = useState<MovementTypeValue | typeof ALL>(ALL);
  const [reasonFilter, setReasonFilter] = useState<MovementReasonValue | typeof ALL>(ALL);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const hasFilters =
    product !== null ||
    typeFilter !== ALL ||
    reasonFilter !== ALL ||
    dateFrom.length > 0 ||
    dateTo.length > 0;

  function clearFilters(): void {
    setProduct(null);
    setTypeFilter(ALL);
    setReasonFilter(ALL);
    setDateFrom('');
    setDateTo('');
    setPageIndex(0);
  }

  const activeSort = sorting[0];
  const { data, isPending, isError, error, refetch } = useMovementsQuery({
    page: pageIndex + 1,
    sort: activeSort?.id ?? 'createdAt',
    order: activeSort?.desc ? 'desc' : 'asc',
    ...(product !== null ? { productId: product.id } : {}),
    ...(typeFilter !== ALL ? { type: typeFilter } : {}),
    ...(reasonFilter !== ALL ? { reason: reasonFilter } : {}),
    ...(dateFrom.length > 0 ? { dateFrom } : {}),
    ...(dateTo.length > 0 ? { dateTo } : {}),
  });

  const columns: DataTableColumn<Movement>[] = [
    {
      accessorKey: 'createdAt',
      header: 'Data',
      enableSorting: true,
      cell: ({ row }) => formatDateTime(row.original.createdAt),
    },
    {
      id: 'product',
      header: 'Produto',
      enableSorting: false,
      cell: ({ row }) => (
        <Link to={`/products/${row.original.productId}`} className="hover:underline">
          Ver produto
        </Link>
      ),
    },
    {
      accessorKey: 'type',
      header: 'Tipo',
      enableSorting: false,
      cell: ({ row }) => <MovementTypeBadge type={row.original.type} />,
    },
    {
      accessorKey: 'reason',
      header: 'Motivo',
      enableSorting: false,
      cell: ({ row }) =>
        REASON_LABEL[row.original.reason as MovementReasonValue] ?? row.original.reason,
    },
    {
      accessorKey: 'quantity',
      header: 'Quantidade',
      enableSorting: true,
      cell: ({ row }) => <span className="font-mono">{formatQuantity(row.original.quantity)}</span>,
    },
    {
      accessorKey: 'stockAfter',
      header: 'Saldo após',
      enableSorting: false,
      cell: ({ row }) => (
        <span className="font-mono">{formatQuantity(row.original.stockAfter)}</span>
      ),
    },
    {
      id: 'user',
      header: 'Responsável',
      enableSorting: false,
      cell: ({ row }) => row.original.user.name,
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Movimentações"
        description="Histórico imutável de entradas, saídas e ajustes."
        action={
          <Button asChild>
            <Link to="/movements/new">
              <Plus aria-hidden="true" className="size-4" />
              Nova movimentação
            </Link>
          </Button>
        }
      />

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <ProductPicker
          aria-label="Filtrar por produto"
          value={product}
          onChange={(value) => {
            setProduct(value);
            setPageIndex(0);
          }}
        />

        <Select
          value={typeFilter}
          onValueChange={(value) => {
            setTypeFilter(value as MovementTypeValue | typeof ALL);
            setReasonFilter(ALL);
            setPageIndex(0);
          }}
        >
          <SelectTrigger size="sm" className="w-full" aria-label="Filtrar por tipo de movimentação">
            <SelectValue placeholder="Tipo" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Qualquer tipo</SelectItem>
            <SelectItem value="IN">Entrada</SelectItem>
            <SelectItem value="OUT">Saída</SelectItem>
            {canAdjust ? <SelectItem value="ADJUSTMENT">Ajuste</SelectItem> : null}
          </SelectContent>
        </Select>

        <Select
          value={reasonFilter}
          onValueChange={(value) => {
            setReasonFilter(value as MovementReasonValue | typeof ALL);
            setPageIndex(0);
          }}
        >
          <SelectTrigger
            size="sm"
            className="w-full"
            aria-label="Filtrar por motivo da movimentação"
          >
            <SelectValue placeholder="Motivo" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Qualquer motivo</SelectItem>
            {MOVEMENT_REASONS.filter((reason) => reason !== 'INVENTORY_ADJUSTMENT').map(
              (reason) => (
                <SelectItem key={reason} value={reason}>
                  {REASON_LABEL[reason]}
                </SelectItem>
              ),
            )}
          </SelectContent>
        </Select>

        <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-1">
          <Input
            type="date"
            value={dateFrom}
            onChange={(event) => {
              setDateFrom(event.target.value);
              setPageIndex(0);
            }}
            aria-label="Data inicial"
            className="w-full"
          />
          <span className="text-xs text-muted-foreground">até</span>
          <Input
            type="date"
            value={dateTo}
            onChange={(event) => {
              setDateTo(event.target.value);
              setPageIndex(0);
            }}
            aria-label="Data final"
            className="w-full"
          />
        </div>
      </div>

      <DataTable
        columns={columns}
        data={data?.data ?? []}
        getRowId={(row) => row.id}
        caption="Histórico de movimentações"
        empty={{
          title: 'Nenhuma movimentação registrada',
          description: 'Entradas, saídas e ajustes aparecem aqui assim que forem lançados.',
          icon: Boxes,
        }}
        renderCard={(row) => (
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between gap-2">
              <MovementTypeBadge type={row.type} />
              <span className="font-mono text-sm font-medium">{formatQuantity(row.quantity)}</span>
            </div>
            <div className="flex items-center justify-between gap-2 text-sm">
              <span>{REASON_LABEL[row.reason as MovementReasonValue] ?? row.reason}</span>
              <span className="font-mono text-xs text-muted-foreground">
                Saldo: {formatQuantity(row.stockAfter)}
              </span>
            </div>
            <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
              <span>
                {formatDateTime(row.createdAt)} · {row.user.name}
              </span>
              <Link
                to={`/products/${row.productId}`}
                className="font-medium text-foreground hover:underline"
              >
                Ver produto
              </Link>
            </div>
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
    </div>
  );
}
