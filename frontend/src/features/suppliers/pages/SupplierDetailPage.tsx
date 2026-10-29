import { useState, type ReactNode } from 'react';
import { useParams } from 'react-router';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { DataTable, type DataTableColumn } from '@/components/shared/DataTable';
import { ErrorState } from '@/components/shared/ErrorState';
import { PageHeader } from '@/components/shared/PageHeader';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/features/auth/auth-context';
import { SupplierForm } from '@/features/suppliers/components/SupplierForm';
import {
  useSetSupplierStatusMutation,
  useSupplierProductsQuery,
  useSupplierQuery,
  useUpdateSupplierMutation,
} from '@/features/suppliers/queries';
import type { SupplierFormValues } from '@/features/suppliers/schemas';
import type { Product } from '@/features/products/api';
import { StockBadge } from '@/components/shared/StockBadge';
import { ApiError } from '@/lib/api-client';
import { messageForCode } from '@/lib/error-messages';
import { formatQuantity } from '@/lib/format';
import { classifyStock } from '@/lib/stock-status';

export function SupplierDetailPage(): ReactNode {
  const { id } = useParams<{ id: string }>();
  const supplierId = id ?? '';
  const { user } = useAuth();
  const canManage = user?.role === 'ADMIN' || user?.role === 'MANAGER';

  const [isEditing, setIsEditing] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [productsPage, setProductsPage] = useState(0);

  const { data: supplier, isPending, isError, error, refetch } = useSupplierQuery(supplierId);
  const updateMutation = useUpdateSupplierMutation(supplierId);
  const setStatusMutation = useSetSupplierStatusMutation();
  const productsQuery = useSupplierProductsQuery(supplierId, { page: productsPage + 1 });

  const productColumns: DataTableColumn<Product>[] = [
    { accessorKey: 'sku', header: 'SKU', enableSorting: false },
    { accessorKey: 'name', header: 'Produto', enableSorting: false },
    {
      id: 'stock',
      header: 'Estoque',
      enableSorting: false,
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <span className="font-mono">{formatQuantity(row.original.currentStock)}</span>
          <StockBadge status={classifyStock(row.original.currentStock, row.original.minStock)} />
        </div>
      ),
    },
  ];

  if (isPending) {
    return (
      <div className="flex flex-col gap-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-48 w-full max-w-xl" />
      </div>
    );
  }

  if (isError || supplier === undefined) {
    return (
      <ErrorState
        {...(error instanceof ApiError && error.code !== undefined ? { code: error.code } : {})}
        onRetry={() => void refetch()}
      />
    );
  }

  async function handleEditSubmit(values: SupplierFormValues): Promise<void> {
    setFormError(null);

    const input = {
      name: values.name,
      ...(values.taxId ? { taxId: values.taxId } : {}),
      ...(values.email ? { email: values.email } : {}),
      ...(values.phone ? { phone: values.phone } : {}),
      ...(values.notes ? { notes: values.notes } : {}),
    };

    try {
      await updateMutation.mutateAsync(input);
      setIsEditing(false);
    } catch (err) {
      setFormError(
        err instanceof ApiError
          ? messageForCode(err.code, err.message)
          : 'Não foi possível salvar o fornecedor. Tente novamente.',
      );
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={supplier.name}
        breadcrumbs={[{ label: 'Fornecedores', to: '/suppliers' }, { label: supplier.name }]}
        action={
          canManage && !isEditing ? (
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setIsEditing(true);
                }}
              >
                Editar
              </Button>
              <ConfirmDialog
                trigger={
                  <Button variant="outline">{supplier.isActive ? 'Inativar' : 'Ativar'}</Button>
                }
                title={
                  supplier.isActive
                    ? `Inativar o fornecedor ${supplier.name}?`
                    : `Ativar o fornecedor ${supplier.name}?`
                }
                description={
                  supplier.isActive
                    ? 'Produtos vinculados continuam cadastrados, sem fornecedor associado.'
                    : 'O fornecedor volta a aparecer nas opções de cadastro de produto.'
                }
                destructive={supplier.isActive}
                onConfirm={async () => {
                  try {
                    await setStatusMutation.mutateAsync({
                      id: supplier.id,
                      isActive: !supplier.isActive,
                    });
                  } catch (err) {
                    toast.error(
                      err instanceof ApiError
                        ? messageForCode(err.code, err.message)
                        : 'Não foi possível alterar a situação do fornecedor.',
                    );
                  }
                }}
              />
            </div>
          ) : undefined
        }
      />

      <Card className="max-w-xl border shadow-none">
        <CardContent className="pt-6">
          {isEditing ? (
            <SupplierForm
              defaultValues={{
                name: supplier.name,
                taxId: supplier.taxId ?? '',
                email: supplier.email ?? '',
                phone: supplier.phone ?? '',
                notes: supplier.notes ?? '',
              }}
              onSubmit={handleEditSubmit}
              isPending={updateMutation.isPending}
              submitLabel="Salvar"
              formError={formError}
              onCancel={() => {
                setIsEditing(false);
                setFormError(null);
              }}
            />
          ) : (
            <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <dt className="text-xs text-muted-foreground">Situação</dt>
                <dd>
                  {supplier.isActive ? (
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
                <dt className="text-xs text-muted-foreground">CNPJ/CPF</dt>
                <dd>{supplier.taxId ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">E-mail</dt>
                <dd>{supplier.email ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Telefone</dt>
                <dd>{supplier.phone ?? '—'}</dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-xs text-muted-foreground">Observações</dt>
                <dd>{supplier.notes ?? '—'}</dd>
              </div>
            </dl>
          )}
        </CardContent>
      </Card>

      <Card className="border shadow-none">
        <CardHeader>
          <CardTitle className="text-base">Produtos vinculados</CardTitle>
        </CardHeader>
        <CardContent>
          <DataTable
            columns={productColumns}
            data={productsQuery.data?.data ?? []}
            getRowId={(row) => row.id}
            caption={`Produtos vinculados a ${supplier.name}`}
            empty={{
              title: 'Nenhum produto vinculado',
              description: 'Produtos cadastrados com este fornecedor aparecem aqui.',
            }}
            state={productsQuery.isPending ? { status: 'loading' } : { status: 'ready' }}
            server={{
              pageIndex: productsPage,
              pageCount: productsQuery.data?.meta.totalPages ?? 0,
              onPageChange: setProductsPage,
            }}
          />
        </CardContent>
      </Card>
    </div>
  );
}
