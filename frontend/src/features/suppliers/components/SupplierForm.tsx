import { zodResolver } from '@hookform/resolvers/zod';
import { type ReactNode } from 'react';
import { useForm } from 'react-hook-form';
import { FormField } from '@/components/shared/FormField';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { supplierSchema, type SupplierFormValues } from '@/features/suppliers/schemas';

export interface SupplierFormProps {
  defaultValues?: Partial<SupplierFormValues>;
  onSubmit: (values: SupplierFormValues) => Promise<void>;
  isPending: boolean;
  submitLabel: string;
  formError: string | null;
  onCancel?: () => void;
}

/**
 * Campos do fornecedor, compartilhados entre `/suppliers/new` e a edição no
 * detalhe (`/suppliers/:id`) — o mapa de telas não reserva uma rota
 * `/suppliers/:id/edit` própria (docs/18-plano-fase-6.md §18.3).
 */
export function SupplierForm({
  defaultValues,
  onSubmit,
  isPending,
  submitLabel,
  formError,
  onCancel,
}: SupplierFormProps): ReactNode {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<SupplierFormValues>({
    resolver: zodResolver(supplierSchema),
    defaultValues: {
      name: defaultValues?.name ?? '',
      taxId: defaultValues?.taxId ?? '',
      email: defaultValues?.email ?? '',
      phone: defaultValues?.phone ?? '',
      notes: defaultValues?.notes ?? '',
    },
    mode: 'onBlur',
  });

  return (
    <form
      noValidate
      onSubmit={(event) => {
        void handleSubmit(onSubmit)(event);
      }}
      className="flex flex-col gap-4"
    >
      <FormField label="Nome" error={errors.name?.message} required>
        {(field) => <Input {...field} {...register('name')} autoFocus />}
      </FormField>

      <FormField
        label="CNPJ ou CPF"
        error={errors.taxId?.message}
        hint="00.000.000/0000-00 ou 000.000.000-00."
      >
        {(field) => <Input {...field} {...register('taxId')} placeholder="00.000.000/0000-00" />}
      </FormField>

      <FormField label="E-mail" error={errors.email?.message}>
        {(field) => <Input {...field} {...register('email')} type="email" />}
      </FormField>

      <FormField label="Telefone" error={errors.phone?.message}>
        {(field) => <Input {...field} {...register('phone')} type="tel" />}
      </FormField>

      <FormField label="Observações" error={errors.notes?.message}>
        {(field) => <Input {...field} {...register('notes')} />}
      </FormField>

      {formError !== null ? (
        <p
          role="alert"
          className="rounded-(--radius-md) border border-(--color-danger)/30 bg-(--color-danger)/10 px-3 py-2 text-xs text-(--color-danger)"
        >
          {formError}
        </p>
      ) : null}

      <div className="flex items-center gap-2">
        {onCancel ? (
          <Button type="button" variant="outline" onClick={onCancel} disabled={isPending}>
            Cancelar
          </Button>
        ) : null}
        <Button type="submit" disabled={isPending}>
          {isPending ? 'Salvando…' : submitLabel}
        </Button>
      </div>
    </form>
  );
}
