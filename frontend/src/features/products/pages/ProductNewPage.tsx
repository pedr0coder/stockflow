import { useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { Card, CardContent } from '@/components/ui/card';
import { PageHeader } from '@/components/shared/PageHeader';
import { ProductForm } from '@/features/products/components/ProductForm';
import { useCreateProductMutation } from '@/features/products/queries';
import type { ProductFormValues } from '@/features/products/schemas';
import { ApiError } from '@/lib/api-client';
import { messageForCode } from '@/lib/error-messages';

function toInput(values: ProductFormValues) {
  return {
    sku: values.sku,
    name: values.name,
    categoryId: values.categoryId,
    unit: values.unit,
    ...(values.description ? { description: values.description } : {}),
    ...(values.supplierId ? { supplierId: values.supplierId } : {}),
    ...(values.minStock ? { minStock: values.minStock } : {}),
    ...(values.unitCost ? { unitCost: values.unitCost } : {}),
  };
}

export function ProductNewPage(): ReactNode {
  const navigate = useNavigate();
  const [formError, setFormError] = useState<string | null>(null);
  const createMutation = useCreateProductMutation();

  async function handleSubmit(values: ProductFormValues): Promise<void> {
    setFormError(null);

    try {
      const created = await createMutation.mutateAsync(toInput(values));
      await navigate(`/products/${created.id}`, { replace: true });
    } catch (error) {
      setFormError(
        error instanceof ApiError
          ? messageForCode(error.code, error.message)
          : 'Não foi possível cadastrar o produto. Tente novamente.',
      );
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Novo produto"
        breadcrumbs={[{ label: 'Produtos', to: '/products' }, { label: 'Novo produto' }]}
      />

      <Card className="max-w-2xl border shadow-none">
        <CardContent className="pt-6">
          <ProductForm
            onSubmit={handleSubmit}
            isPending={createMutation.isPending}
            submitLabel="Cadastrar"
            formError={formError}
            onCancel={() => void navigate('/products')}
          />
        </CardContent>
      </Card>
    </div>
  );
}
