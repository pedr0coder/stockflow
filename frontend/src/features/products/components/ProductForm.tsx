import { zodResolver } from '@hookform/resolvers/zod';
import { type ReactNode } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { FormField } from '@/components/shared/FormField';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useCategoriesQuery } from '@/features/categories/queries';
import { useSuppliersQuery } from '@/features/suppliers/queries';
import { UNITS_OF_MEASURE, UNIT_LABEL } from '@/features/products/api';
import { productSchema, type ProductFormValues } from '@/features/products/schemas';

export interface ProductFormProps {
  defaultValues?: Partial<ProductFormValues>;
  onSubmit: (values: ProductFormValues) => Promise<void>;
  isPending: boolean;
  submitLabel: string;
  formError: string | null;
  onCancel?: () => void;
  /** SKU não é editável depois de criado (identidade do produto). */
  skuReadOnly?: boolean;
}

/**
 * Campos de produto, compartilhados entre `/products/new` e
 * `/products/:id/edit`.
 *
 * `currentStock` nunca aparece aqui — saldo só muda por movimentação
 * (Marco 6C), e o próprio contrato (`ProductInput`) não tem esse campo.
 */
export function ProductForm({
  defaultValues,
  onSubmit,
  isPending,
  submitLabel,
  formError,
  onCancel,
  skuReadOnly = false,
}: ProductFormProps): ReactNode {
  const categoriesQuery = useCategoriesQuery({ page: 1, limit: 100, isActive: true });
  const suppliersQuery = useSuppliersQuery({ page: 1, limit: 100, isActive: true });

  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = useForm<ProductFormValues>({
    resolver: zodResolver(productSchema),
    defaultValues: {
      sku: defaultValues?.sku ?? '',
      name: defaultValues?.name ?? '',
      description: defaultValues?.description ?? '',
      categoryId: defaultValues?.categoryId ?? '',
      supplierId: defaultValues?.supplierId ?? '',
      unit: defaultValues?.unit ?? 'UN',
      minStock: defaultValues?.minStock ?? '',
      unitCost: defaultValues?.unitCost ?? '',
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
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <FormField label="SKU" error={errors.sku?.message} required>
          {(field) => (
            <Input
              {...field}
              {...register('sku')}
              disabled={skuReadOnly}
              autoFocus={!skuReadOnly}
              className="uppercase"
            />
          )}
        </FormField>

        <FormField label="Nome" error={errors.name?.message} required>
          {(field) => <Input {...field} {...register('name')} autoFocus={skuReadOnly} />}
        </FormField>
      </div>

      <FormField label="Descrição" error={errors.description?.message}>
        {(field) => <Input {...field} {...register('description')} />}
      </FormField>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <FormField label="Categoria" error={errors.categoryId?.message} required>
          {(field) => (
            <Controller
              name="categoryId"
              control={control}
              render={({ field: controllerField }) => (
                <Select value={controllerField.value} onValueChange={controllerField.onChange}>
                  <SelectTrigger {...field} className="w-full">
                    <SelectValue placeholder="Selecione a categoria" />
                  </SelectTrigger>
                  <SelectContent>
                    {categoriesQuery.data?.data.map((category) => (
                      <SelectItem key={category.id} value={category.id}>
                        {category.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          )}
        </FormField>

        <FormField label="Fornecedor" error={errors.supplierId?.message}>
          {(field) => (
            <Controller
              name="supplierId"
              control={control}
              render={({ field: controllerField }) => (
                <Select
                  value={
                    controllerField.value && controllerField.value.length > 0
                      ? controllerField.value
                      : 'none'
                  }
                  onValueChange={(value) => {
                    controllerField.onChange(value === 'none' ? '' : value);
                  }}
                >
                  <SelectTrigger {...field} className="w-full">
                    <SelectValue placeholder="Sem fornecedor" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sem fornecedor</SelectItem>
                    {suppliersQuery.data?.data.map((supplier) => (
                      <SelectItem key={supplier.id} value={supplier.id}>
                        {supplier.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          )}
        </FormField>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <FormField label="Unidade de medida" error={errors.unit?.message} required>
          {(field) => (
            <Controller
              name="unit"
              control={control}
              render={({ field: controllerField }) => (
                <Select value={controllerField.value} onValueChange={controllerField.onChange}>
                  <SelectTrigger {...field} className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {UNITS_OF_MEASURE.map((value) => (
                      <SelectItem key={value} value={value}>
                        {UNIT_LABEL[value]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          )}
        </FormField>

        <FormField
          label="Estoque mínimo"
          error={errors.minStock?.message}
          hint="Decimal com até 3 casas."
        >
          {(field) => <Input {...field} {...register('minStock')} placeholder="0.000" />}
        </FormField>

        <FormField
          label="Custo unitário"
          error={errors.unitCost?.message}
          hint="Decimal com até 4 casas."
        >
          {(field) => <Input {...field} {...register('unitCost')} placeholder="0.0000" />}
        </FormField>
      </div>

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
