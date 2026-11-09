import type { UseQueryResult } from '@tanstack/react-query';
import type { RowData } from '@tanstack/react-table';
import { useMemo, useState, type ReactNode } from 'react';
import { DataTable, type DataTableColumn } from '@/components/shared/DataTable';
import { ErrorState } from '@/components/shared/ErrorState';
import { PageHeader } from '@/components/shared/PageHeader';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/features/auth/auth-context';
import type {
  DivergenceRow,
  InventoryReportRow,
  LowStockItem,
  MovementsReportRow,
  OutOfStockItem,
  ReconciliationRow,
} from '@/features/reports/api';
import {
  useDivergencesReportQuery,
  useInventoriesReportQuery,
  useLowStockReportQuery,
  useMovementsReportQuery,
  useOutOfStockReportQuery,
  useStockReconciliationReportQuery,
} from '@/features/reports/queries';
import { REASON_LABEL, type MovementReasonValue } from '@/features/stock-movements/api';
import { MovementTypeBadge } from '@/components/shared/MovementTypeBadge';
import { ApiError } from '@/lib/api-client';
import { formatDate, formatQuantity } from '@/lib/format';

type ReportKey =
  | 'low-stock'
  | 'out-of-stock'
  | 'movements'
  | 'inventories'
  | 'divergences'
  | 'stock-reconciliation';

interface ReportOption {
  key: ReportKey;
  label: string;
  roles: readonly ('ADMIN' | 'MANAGER' | 'OPERATOR')[];
}

const REPORT_OPTIONS: readonly ReportOption[] = [
  { key: 'low-stock', label: 'Estoque baixo', roles: ['ADMIN', 'MANAGER', 'OPERATOR'] },
  { key: 'out-of-stock', label: 'Produtos sem estoque', roles: ['ADMIN', 'MANAGER', 'OPERATOR'] },
  { key: 'movements', label: 'Movimentações', roles: ['ADMIN', 'MANAGER', 'OPERATOR'] },
  { key: 'inventories', label: 'Inventários', roles: ['ADMIN', 'MANAGER'] },
  { key: 'divergences', label: 'Divergências', roles: ['ADMIN', 'MANAGER'] },
  { key: 'stock-reconciliation', label: 'Reconciliação de estoque', roles: ['ADMIN'] },
];

/**
 * Nenhum dos seis relatórios pagina no servidor (confirmado direto nos
 * controllers — todos devolvem array simples). `DataTable` sem `server` ==
 * pagina a resposta inteira no cliente, correto aqui porque não há "próxima
 * página" para buscar.
 */
export function ReportsPage(): ReactNode {
  const { user } = useAuth();
  const role = user?.role ?? 'OPERATOR';
  const availableReports = useMemo(
    () => REPORT_OPTIONS.filter((option) => option.roles.includes(role)),
    [role],
  );

  const [selected, setSelected] = useState<ReportKey>('low-stock');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const lowStock = useLowStockReportQuery(selected === 'low-stock');
  const outOfStock = useOutOfStockReportQuery(selected === 'out-of-stock');
  const movements = useMovementsReportQuery(
    { ...(dateFrom ? { dateFrom } : {}), ...(dateTo ? { dateTo } : {}) },
    selected === 'movements',
  );
  const inventories = useInventoriesReportQuery(selected === 'inventories');
  const divergences = useDivergencesReportQuery(selected === 'divergences');
  const reconciliation = useStockReconciliationReportQuery(selected === 'stock-reconciliation');

  const lowStockColumns: DataTableColumn<LowStockItem>[] = [
    { accessorKey: 'sku', header: 'SKU', enableSorting: false },
    { accessorKey: 'name', header: 'Produto', enableSorting: false },
    {
      id: 'currentStock',
      header: 'Saldo',
      enableSorting: false,
      cell: ({ row }) => (
        <span className="font-mono">{formatQuantity(row.original.currentStock)}</span>
      ),
    },
    {
      id: 'minStock',
      header: 'Mínimo',
      enableSorting: false,
      cell: ({ row }) => <span className="font-mono">{formatQuantity(row.original.minStock)}</span>,
    },
    {
      id: 'deficit',
      header: 'Déficit',
      enableSorting: false,
      cell: ({ row }) => (
        <span className="font-mono text-(--color-warning)">
          {formatQuantity(row.original.deficit)}
        </span>
      ),
    },
  ];

  const outOfStockColumns: DataTableColumn<OutOfStockItem>[] = [
    { accessorKey: 'sku', header: 'SKU', enableSorting: false },
    { accessorKey: 'name', header: 'Produto', enableSorting: false },
  ];

  const movementsColumns: DataTableColumn<MovementsReportRow>[] = [
    {
      id: 'type',
      header: 'Tipo',
      enableSorting: false,
      cell: ({ row }) => (
        <MovementTypeBadge type={row.original.type as 'IN' | 'OUT' | 'ADJUSTMENT'} />
      ),
    },
    {
      id: 'reason',
      header: 'Motivo',
      enableSorting: false,
      cell: ({ row }) =>
        REASON_LABEL[row.original.reason as MovementReasonValue] ?? row.original.reason,
    },
    { accessorKey: 'movementsCount', header: 'Quantidade de lançamentos', enableSorting: false },
    {
      id: 'totalQuantity',
      header: 'Soma das quantidades',
      enableSorting: false,
      cell: ({ row }) => (
        <span className="font-mono">{formatQuantity(row.original.totalQuantity)}</span>
      ),
    },
  ];

  const inventoriesColumns: DataTableColumn<InventoryReportRow>[] = [
    { accessorKey: 'code', header: 'Código', enableSorting: false },
    { accessorKey: 'status', header: 'Situação', enableSorting: false },
    {
      id: 'startedAt',
      header: 'Iniciado em',
      enableSorting: false,
      cell: ({ row }) => formatDate(row.original.startedAt),
    },
    { accessorKey: 'itemsCount', header: 'Itens', enableSorting: false },
    { accessorKey: 'countedCount', header: 'Contados', enableSorting: false },
    { accessorKey: 'adjustedCount', header: 'Ajustados', enableSorting: false },
  ];

  const divergencesColumns: DataTableColumn<DivergenceRow>[] = [
    { accessorKey: 'inventoryCode', header: 'Inventário', enableSorting: false },
    { accessorKey: 'productName', header: 'Produto', enableSorting: false },
    {
      id: 'expectedQty',
      header: 'Esperado',
      enableSorting: false,
      cell: ({ row }) => (
        <span className="font-mono">{formatQuantity(row.original.expectedQty)}</span>
      ),
    },
    {
      id: 'countedQty',
      header: 'Contado',
      enableSorting: false,
      cell: ({ row }) => (
        <span className="font-mono">{formatQuantity(row.original.countedQty)}</span>
      ),
    },
    {
      id: 'movedSinceCount',
      header: 'Desde a contagem',
      enableSorting: false,
      cell: ({ row }) => (
        <span className="font-mono">{formatQuantity(row.original.movedSinceCount)}</span>
      ),
    },
  ];

  const reconciliationColumns: DataTableColumn<ReconciliationRow>[] = [
    { accessorKey: 'sku', header: 'SKU', enableSorting: false },
    { accessorKey: 'name', header: 'Produto', enableSorting: false },
    {
      id: 'currentStock',
      header: 'Saldo atual',
      enableSorting: false,
      cell: ({ row }) => (
        <span className="font-mono">{formatQuantity(row.original.currentStock)}</span>
      ),
    },
    {
      id: 'derivedStock',
      header: 'Saldo derivado',
      enableSorting: false,
      cell: ({ row }) => (
        <span className="font-mono">{formatQuantity(row.original.derivedStock)}</span>
      ),
    },
    {
      id: 'difference',
      header: 'Diferença',
      enableSorting: false,
      cell: ({ row }) => {
        const isZero = Number.parseFloat(row.original.difference) === 0;

        return (
          <span className={isZero ? 'font-mono' : 'font-mono text-(--color-danger)'}>
            {formatQuantity(row.original.difference)}
          </span>
        );
      },
    },
  ];

  function renderSelected(): ReactNode {
    switch (selected) {
      case 'low-stock':
        return renderReport(
          lowStock,
          lowStockColumns,
          (row) => row.id,
          'Produtos com estoque baixo',
        );
      case 'out-of-stock':
        return renderReport(outOfStock, outOfStockColumns, (row) => row.id, 'Produtos sem estoque');
      case 'movements':
        return (
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-1">
              <Input
                type="date"
                value={dateFrom}
                onChange={(event) => {
                  setDateFrom(event.target.value);
                }}
                aria-label="Data inicial"
                className="w-full sm:w-44"
              />
              <span className="text-xs text-muted-foreground">até</span>
              <Input
                type="date"
                value={dateTo}
                onChange={(event) => {
                  setDateTo(event.target.value);
                }}
                aria-label="Data final"
                className="w-full sm:w-44"
              />
            </div>
            {renderReport(
              movements,
              movementsColumns,
              (row) => `${row.type}-${row.reason}`,
              'Movimentações agrupadas por tipo e motivo',
            )}
          </div>
        );
      case 'inventories':
        return renderReport(
          inventories,
          inventoriesColumns,
          (row) => row.id,
          'Resumo dos inventários',
        );
      case 'divergences':
        return renderReport(
          divergences,
          divergencesColumns,
          (row) => row.itemId,
          'Divergências de contagem',
        );
      case 'stock-reconciliation':
        return renderReport(
          reconciliation,
          reconciliationColumns,
          (row) => row.id,
          'Reconciliação entre saldo e soma das movimentações',
        );
      default:
        return null;
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Relatórios"
        description="Estoque baixo, sem estoque, movimentações e divergências."
      />

      <Select
        value={selected}
        onValueChange={(value) => {
          setSelected(value as ReportKey);
        }}
      >
        <SelectTrigger className="w-full sm:w-72" aria-label="Selecionar relatório">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {availableReports.map((option) => (
            <SelectItem key={option.key} value={option.key}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {renderSelected()}
    </div>
  );
}

function renderReport<TRow extends RowData>(
  query: UseQueryResult<TRow[], Error>,
  columns: DataTableColumn<TRow>[],
  getRowId: (row: TRow) => string,
  caption: string,
): ReactNode {
  if (query.isPending) {
    return <Skeleton className="h-64 w-full" />;
  }

  if (query.isError) {
    return (
      <ErrorState
        {...(query.error instanceof ApiError && query.error.code !== undefined
          ? { code: query.error.code }
          : {})}
        onRetry={() => void query.refetch()}
      />
    );
  }

  return (
    <DataTable
      columns={columns}
      data={query.data ?? []}
      getRowId={getRowId}
      caption={caption}
      empty={{
        title: 'Sem dados para este relatório',
        description: 'Nenhum registro encontrado no momento.',
      }}
      pageSize={20}
    />
  );
}
