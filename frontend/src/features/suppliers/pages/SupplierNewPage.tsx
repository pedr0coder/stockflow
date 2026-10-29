import { useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { Card, CardContent } from '@/components/ui/card';
import { PageHeader } from '@/components/shared/PageHeader';
import { SupplierForm } from '@/features/suppliers/components/SupplierForm';
import { useCreateSupplierMutation } from '@/features/suppliers/queries';
import type { SupplierFormValues } from '@/features/suppliers/schemas';
import { ApiError } from '@/lib/api-client';
import { messageForCode } from '@/lib/error-messages';

function toInput(values: SupplierFormValues) {
  return {
    name: values.name,
    ...(values.taxId ? { taxId: values.taxId } : {}),
    ...(values.email ? { email: values.email } : {}),
    ...(values.phone ? { phone: values.phone } : {}),
    ...(values.notes ? { notes: values.notes } : {}),
  };
}

export function SupplierNewPage(): ReactNode {
  const navigate = useNavigate();
  const [formError, setFormError] = useState<string | null>(null);
  const createMutation = useCreateSupplierMutation();

  async function handleSubmit(values: SupplierFormValues): Promise<void> {
    setFormError(null);

    try {
      const created = await createMutation.mutateAsync(toInput(values));
      await navigate(`/suppliers/${created.id}`, { replace: true });
    } catch (error) {
      setFormError(
        error instanceof ApiError
          ? messageForCode(error.code, error.message)
          : 'Não foi possível cadastrar o fornecedor. Tente novamente.',
      );
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Novo fornecedor"
        breadcrumbs={[{ label: 'Fornecedores', to: '/suppliers' }, { label: 'Novo fornecedor' }]}
      />

      <Card className="max-w-xl border shadow-none">
        <CardContent className="pt-6">
          <SupplierForm
            onSubmit={handleSubmit}
            isPending={createMutation.isPending}
            submitLabel="Cadastrar"
            formError={formError}
            onCancel={() => void navigate('/suppliers')}
          />
        </CardContent>
      </Card>
    </div>
  );
}
