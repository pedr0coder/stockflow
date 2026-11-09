import { Package, Plus } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { DataTable, type DataTableColumn } from '@/components/shared/DataTable';
import { PageHeader } from '@/components/shared/PageHeader';
import { StockBadge } from '@/components/shared/StockBadge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { SortingState } from '@tanstack/react-table';
import { useAuth } from '@/features/auth/auth-context';
import { useCategoriesQuery } from '@/features/categories/queries';
import type { Product, StockStatusFilter } from '@/features/products/api';
import { useProductsQuery, useSetProductStatusMutation } from '@/features/products/queries';
import { ApiError } from '@/lib/api-client';
import { messageForCode } from '@/lib/error-messages';
import { formatQuantity } from '@/lib/format';
import { toDataTableErrorState } from '@/lib/query-error';
import { classifyStock } from '@/lib/stock-status';
import { useDebouncedValue } from '@/lib/use-debounced-value';

type StatusFilter = 'active' | 'all' | 'inactive';

const STATUS_FILTER_TO_PARAM: Readonly<Record<StatusFilter, boolean | undefined>> = {
  active: true,
  all: undefined,
  inactive: false,
};

const ALL = 'all';

export function ProductsPage(): ReactNode {
  const { user } = useAuth();
  const canManage = user?.role === 'ADMIN' || user?.role === 'MANAGER';

  const [pageIndex, setPageIndex] = useState(0);
  const [sorting, setSorting] = useState<SortingState>([{ id: 'name', desc: false }]);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('active');
  const [categoryFilter, setCategoryFilter] = useState<string>(ALL);
  const [stockStatusFilter, setStockStatusFilter] = useState<StockStatusFilter | typeof ALL>(ALL);

  const activeSort = sorting[0];

  const categoriesQuery = useCategoriesQuery({ page: 1, limit: 100, isActive: true });
  const isActiveParam = STATUS_FILTER_TO_PARAM[statusFilter];
  const { data, isPending, isError, error, refetch } = useProductsQuery({
    page: pageIndex + 1,
    sort: activeSort?.id ?? 'name',
    order: activeSort?.desc ? 'desc' : 'asc',
    ...(isActiveParam !== undefined ? { isActive: isActiveParam } : {}),
    ...(debouncedSearch.length > 0 ? { search: debouncedSearch } : {}),
    ...(categoryFilter !== ALL ? { categoryId: categoryFilter } : {}),
    ...(stockStatusFilter !== ALL ? { stockStatus: stockStatusFilter } : {}),
  });
  const setStatusMutation = useSetProductStatusMutation();

  const hasFilters =
    debouncedSearch.length > 0 ||
    statusFilter !== 'active' ||
    categoryFilter !== ALL ||
    stockStatusFilter !== ALL;

  function clearFilters(): void {
    setSearch('');
    setStatusFilter('active');
    setCategoryFilter(ALL);
    setStockStatusFilter(ALL);
    setPageIndex(0);
  }

  const columns: DataTableColumn<Product>[] = [
    {
      accessorKey: 'sku',
      header: 'SKU',
      enableSorting: true,
      cell: ({ row }) => (
        <Link to={`/products/${row.original.id}`} className="font-mono text-sm hover:underline">
          {row.original.sku}
        </Link>
      ),
    },
    {
      accessorKey: 'name',
      header: 'Produto',
      enableSorting: true,
      cell: ({ row }) => (
        <Link to={`/products/${row.original.id}`} className="font-medium hover:underline">
          {row.original.name}
        </Link>
      ),
    },
    {
      accessorKey: 'currentStock',
      header: 'Saldo',
      enableSorting: true,
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <span className="font-mono">{formatQuantity(row.original.currentStock)}</span>
          <StockBadge status={classifyStock(row.original.currentStock, row.original.minStock)} />
        </div>
      ),
    },
    {
      id: 'status',
      header: 'Situação',
      enableSorting: false,
      cell: ({ row }) =>
        row.original.isActive ? (
          <Badge variant="outline" className="font-normal">
            Ativo
          </Badge>
        ) : (
          <Badge variant="outline" className="border-transparent bg-muted font-normal">
            Inativo
          </Badge>
        ),
    },
    ...(canManage
      ? [
          {
            id: 'actions',
            header: 'Ações',
            enableSorting: false,
            cell: ({ row }: { row: { original: Product } }) => {
              const product = row.original;

              return (
                <div className="flex items-center gap-2">
                  <Button variant="ghost" size="sm" asChild>
                    <Link to={`/products/${product.id}/edit`}>Editar</Link>
                  </Button>

                  <ConfirmDialog
                    trigger={
                      <Button variant="ghost" size="sm">
                        {product.isActive ? 'Inativar' : 'Ativar'}
                      </Button>
                    }
                    title={
                      product.isActive
                        ? `Inativar o produto ${product.name}?`
                        : `Ativar o produto ${product.name}?`
                    }
                    description={
                      product.isActive
                        ? 'O produto deixa de aparecer nas opções de movimentação de estoque.'
                        : 'O produto volta a aparecer nas opções de movimentação de estoque.'
                    }
                    destructive={product.isActive}
                    onConfirm={async () => {
                      try {
                        await setStatusMutation.mutateAsync({
                          id: product.id,
                          isActive: !product.isActive,
                        });
                      } catch (err) {
                        toast.error(
                          err instanceof ApiError
                            ? messageForCode(err.code, err.message)
                            : 'Não foi possível alterar a situação do produto.',
                        );
                      }
                    }}
                  />
                </div>
              );
            },
          } satisfies DataTableColumn<Product>,
        ]
      : []),
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Produtos"
        description="Catálogo com saldo atual, estoque mínimo, categoria e fornecedor."
        action={
          canManage ? (
            <Button asChild>
              <Link to="/products/new">
                <Plus aria-hidden="true" className="size-4" />
                Novo produto
              </Link>
            </Button>
          ) : undefined
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setPageIndex(0);
          }}
          placeholder="Buscar por SKU ou nome…"
          className="w-full sm:w-64"
          aria-label="Buscar produto"
        />

        <Select
          value={categoryFilter}
          onValueChange={(value) => {
            setCategoryFilter(value);
            setPageIndex(0);
          }}
        >
          <SelectTrigger size="sm" className="w-full sm:w-44" aria-label="Filtrar por categoria">
            <SelectValue placeholder="Categoria" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Todas as categorias</SelectItem>
            {categoriesQuery.data?.data.map((category) => (
              <SelectItem key={category.id} value={category.id}>
                {category.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={stockStatusFilter}
          onValueChange={(value) => {
            setStockStatusFilter(value as StockStatusFilter | typeof ALL);
            setPageIndex(0);
          }}
        >
          <SelectTrigger
            size="sm"
            className="w-full sm:w-40"
            aria-label="Filtrar por situação de estoque"
          >
            <SelectValue placeholder="Situação de estoque" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Qualquer estoque</SelectItem>
            <SelectItem value="ok">Normal</SelectItem>
            <SelectItem value="low">Estoque baixo</SelectItem>
            <SelectItem value="out">Sem estoque</SelectItem>
          </SelectContent>
        </Select>

        <Select
          value={statusFilter}
          onValueChange={(value) => {
            setStatusFilter(value as StatusFilter);
            setPageIndex(0);
          }}
        >
          <SelectTrigger
            size="sm"
            className="w-full sm:w-36"
            aria-label="Filtrar por situação do produto"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="active">Ativos</SelectItem>
            <SelectItem value={ALL}>Todos</SelectItem>
            <SelectItem value="inactive">Inativos</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <DataTable
        columns={columns}
        data={data?.data ?? []}
        getRowId={(row) => row.id}
        caption="Lista de produtos"
        empty={{
          title: 'Nenhum produto cadastrado',
          description: 'Cadastre o primeiro produto do estoque.',
          icon: Package,
        }}
        renderCard={(row) => (
          <div className="flex flex-col gap-2">
            <Link to={`/products/${row.id}`} className="flex flex-col gap-1.5">
              <div className="flex items-start justify-between gap-2">
                <span className="font-medium hover:underline">{row.name}</span>
                <StockBadge status={classifyStock(row.currentStock, row.minStock)} />
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-xs text-muted-foreground">{row.sku}</span>
                {row.isActive ? (
                  <Badge variant="outline" className="font-normal">
                    Ativo
                  </Badge>
                ) : (
                  <Badge variant="outline" className="border-transparent bg-muted font-normal">
                    Inativo
                  </Badge>
                )}
              </div>
              <span className="font-mono text-sm">{formatQuantity(row.currentStock)}</span>
            </Link>

            {canManage ? (
              <div className="flex items-center justify-end gap-2 border-t pt-2">
                <Button variant="ghost" size="sm" asChild>
                  <Link to={`/products/${row.id}/edit`}>Editar</Link>
                </Button>

                <ConfirmDialog
                  trigger={
                    <Button variant="ghost" size="sm">
                      {row.isActive ? 'Inativar' : 'Ativar'}
                    </Button>
                  }
                  title={
                    row.isActive
                      ? `Inativar o produto ${row.name}?`
                      : `Ativar o produto ${row.name}?`
                  }
                  description={
                    row.isActive
                      ? 'O produto deixa de aparecer nas opções de movimentação de estoque.'
                      : 'O produto volta a aparecer nas opções de movimentação de estoque.'
                  }
                  destructive={row.isActive}
                  onConfirm={async () => {
                    try {
                      await setStatusMutation.mutateAsync({
                        id: row.id,
                        isActive: !row.isActive,
                      });
                    } catch (err) {
                      toast.error(
                        err instanceof ApiError
                          ? messageForCode(err.code, err.message)
                          : 'Não foi possível alterar a situação do produto.',
                      );
                    }
                  }}
                />
              </div>
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
    </div>
  );
}
