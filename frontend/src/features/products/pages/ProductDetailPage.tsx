import { useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { DataTable, type DataTableColumn } from '@/components/shared/DataTable';
import { ErrorState } from '@/components/shared/ErrorState';
import { MovementTypeBadge } from '@/components/shared/MovementTypeBadge';
import { PageHeader } from '@/components/shared/PageHeader';
import { StockBadge } from '@/components/shared/StockBadge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuth } from '@/features/auth/auth-context';
import { useCategoryQuery } from '@/features/categories/queries';
import type { ProductMovement } from '@/features/products/api';
import {
  useProductMovementsQuery,
  useProductQuery,
  useSetProductStatusMutation,
} from '@/features/products/queries';
import { useSupplierQuery } from '@/features/suppliers/queries';
import { ApiError } from '@/lib/api-client';
import { messageForCode } from '@/lib/error-messages';
import { formatDateTime, formatQuantity, formatUnitCost } from '@/lib/format';
import { classifyStock } from '@/lib/stock-status';
import { UNIT_LABEL } from '@/features/products/api';

export function ProductDetailPage(): ReactNode {
  const { id } = useParams<{ id: string }>();
  const productId = id ?? '';
  const { user } = useAuth();
  const canManage = user?.role === 'ADMIN' || user?.role === 'MANAGER';

  const [movementsPage, setMovementsPage] = useState(0);

  const { data: product, isPending, isError, error, refetch } = useProductQuery(productId);
  const categoryQuery = useCategoryQuery(product?.categoryId ?? '');
  const supplierQuery = useSupplierQuery(product?.supplierId ?? '');
  const movementsQuery = useProductMovementsQuery(productId, { page: movementsPage + 1 });
  const setStatusMutation = useSetProductStatusMutation();

  const movementColumns: DataTableColumn<ProductMovement>[] = [
    {
      accessorKey: 'createdAt',
      header: 'Data',
      enableSorting: false,
      cell: ({ row }) => formatDateTime(row.original.createdAt),
    },
    {
      accessorKey: 'type',
      header: 'Tipo',
      enableSorting: false,
      cell: ({ row }) => <MovementTypeBadge type={row.original.type} />,
    },
    { accessorKey: 'reason', header: 'Motivo', enableSorting: false },
    {
      accessorKey: 'quantity',
      header: 'Quantidade',
      enableSorting: false,
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

  if (isPending) {
    return (
      <div className="flex flex-col gap-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (isError || product === undefined) {
    return (
      <ErrorState
        {...(error instanceof ApiError && error.code !== undefined ? { code: error.code } : {})}
        onRetry={() => void refetch()}
      />
    );
  }

  const stockStatus = classifyStock(product.currentStock, product.minStock);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={product.name}
        description={product.sku}
        breadcrumbs={[{ label: 'Produtos', to: '/products' }, { label: product.name }]}
        action={
          canManage ? (
            <div className="flex items-center gap-2">
              <Button variant="outline" asChild>
                <Link to={`/products/${productId}/edit`}>Editar</Link>
              </Button>
              <ConfirmDialog
                trigger={
                  <Button variant="outline">{product.isActive ? 'Inativar' : 'Ativar'}</Button>
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
          ) : undefined
        }
      />

      <Tabs defaultValue="dados">
        <TabsList>
          <TabsTrigger value="dados">Dados</TabsTrigger>
          <TabsTrigger value="historico">Histórico</TabsTrigger>
        </TabsList>

        <TabsContent value="dados">
          <Card className="border shadow-none">
            <CardContent className="pt-6">
              <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <div>
                  <dt className="text-xs text-muted-foreground">Situação</dt>
                  <dd>
                    {product.isActive ? (
                      <Badge variant="outline" className="font-normal">
                        Ativo
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="border-transparent bg-muted font-normal">
                        Inativo
                      </Badge>
                    )}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Saldo atual</dt>
                  <dd className="flex items-center gap-2">
                    <span className="font-mono">{formatQuantity(product.currentStock)}</span>
                    <StockBadge status={stockStatus} />
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Estoque mínimo</dt>
                  <dd className="font-mono">{formatQuantity(product.minStock)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Unidade de medida</dt>
                  <dd>{UNIT_LABEL[product.unit]}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Custo unitário</dt>
                  <dd className="font-mono">{formatUnitCost(product.unitCost)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Categoria</dt>
                  <dd>{categoryQuery.data?.name ?? '—'}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Fornecedor</dt>
                  <dd>{product.supplierId !== null ? (supplierQuery.data?.name ?? '—') : '—'}</dd>
                </div>
                {product.description !== null && product.description.length > 0 ? (
                  <div className="sm:col-span-2 lg:col-span-3">
                    <dt className="text-xs text-muted-foreground">Descrição</dt>
                    <dd>{product.description}</dd>
                  </div>
                ) : null}
              </dl>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="historico">
          <DataTable
            columns={movementColumns}
            data={movementsQuery.data?.data ?? []}
            getRowId={(row) => row.id}
            caption={`Histórico de movimentações de ${product.name}`}
            empty={{
              title: 'Nenhuma movimentação registrada',
              description: 'As entradas, saídas e ajustes deste produto aparecem aqui.',
            }}
            state={movementsQuery.isPending ? { status: 'loading' } : { status: 'ready' }}
            server={{
              pageIndex: movementsPage,
              pageCount: movementsQuery.data?.meta.totalPages ?? 0,
              onPageChange: setMovementsPage,
            }}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
