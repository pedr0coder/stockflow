import { useState, type ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router';
import { Card, CardContent } from '@/components/ui/card';
import { ErrorState } from '@/components/shared/ErrorState';
import { PageHeader } from '@/components/shared/PageHeader';
import { Skeleton } from '@/components/ui/skeleton';
import { ProductForm } from '@/features/products/components/ProductForm';
import { useProductQuery, useUpdateProductMutation } from '@/features/products/queries';
import type { ProductFormValues } from '@/features/products/schemas';
import { ApiError } from '@/lib/api-client';
import { messageForCode } from '@/lib/error-messages';

function toInput(values: ProductFormValues) {
  return {
    name: values.name,
    categoryId: values.categoryId,
    unit: values.unit,
    description: values.description ?? '',
    supplierId: values.supplierId ?? '',
    minStock: values.minStock ?? '',
    unitCost: values.unitCost ?? '',
  };
}

export function ProductEditPage(): ReactNode {
  const { id } = useParams<{ id: string }>();
  const productId = id ?? '';
  const navigate = useNavigate();
  const [formError, setFormError] = useState<string | null>(null);

  const { data: product, isPending, isError, error, refetch } = useProductQuery(productId);
  const updateMutation = useUpdateProductMutation(productId);

  if (isPending) {
    return (
      <div className="flex flex-col gap-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-96 w-full max-w-2xl" />
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

  async function handleSubmit(values: ProductFormValues): Promise<void> {
    setFormError(null);

    try {
      await updateMutation.mutateAsync(toInput(values));
      await navigate(`/products/${productId}`, { replace: true });
    } catch (error) {
      setFormError(
        error instanceof ApiError
          ? messageForCode(error.code, error.message)
          : 'Não foi possível salvar o produto. Tente novamente.',
      );
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={`Editar ${product.name}`}
        breadcrumbs={[
          { label: 'Produtos', to: '/products' },
          { label: product.name, to: `/products/${productId}` },
          { label: 'Editar' },
        ]}
      />

      <Card className="max-w-2xl border shadow-none">
        <CardContent className="pt-6">
          <ProductForm
            defaultValues={{
              sku: product.sku,
              name: product.name,
              description: product.description ?? '',
              categoryId: product.categoryId,
              supplierId: product.supplierId ?? '',
              unit: product.unit,
              minStock: product.minStock,
              unitCost: product.unitCost,
            }}
            onSubmit={handleSubmit}
            isPending={updateMutation.isPending}
            submitLabel="Salvar"
            formError={formError}
            skuReadOnly
            onCancel={() => void navigate(`/products/${productId}`)}
          />
        </CardContent>
      </Card>
    </div>
  );
}
