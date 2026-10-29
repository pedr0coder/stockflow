import { zodResolver } from '@hookform/resolvers/zod';
import { useState, type ReactNode } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useNavigate } from 'react-router';
import { FormField } from '@/components/shared/FormField';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ProductPicker } from '@/features/products/components/ProductPicker';
import type { Product } from '@/features/products/api';
import { useCreateAdjustmentMutation } from '@/features/stock-movements/queries';
import { adjustmentSchema, type AdjustmentFormValues } from '@/features/stock-movements/schemas';
import { ApiError } from '@/lib/api-client';
import { messageForCode } from '@/lib/error-messages';
import { formatQuantity } from '@/lib/format';

/**
 * Ajuste manual: só ADMIN/MANAGER (a própria aba some para OPERATOR em
 * `MovementNewPage`, mas o formulário também não assume isso — o servidor é
 * quem decide, com 403 se chegar aqui por engano). `finalQuantity` é o saldo
 * final, não uma quantidade a somar — por isso o saldo atual aparece ao lado
 * do campo, para a pessoa saber o que está mudando.
 */
export function AdjustmentForm(): ReactNode {
  const navigate = useNavigate();
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const mutation = useCreateAdjustmentMutation();

  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors },
  } = useForm<AdjustmentFormValues>({
    resolver: zodResolver(adjustmentSchema),
    defaultValues: {
      productId: '',
      finalQuantity: '',
      reason: 'CORRECTION',
      referenceDoc: '',
      note: '',
    },
    mode: 'onBlur',
  });

  async function onValidSubmit(values: AdjustmentFormValues): Promise<void> {
    setFormError(null);

    const input = {
      productId: values.productId,
      finalQuantity: values.finalQuantity,
      reason: values.reason,
      note: values.note,
      ...(values.referenceDoc ? { referenceDoc: values.referenceDoc } : {}),
    };

    try {
      await mutation.mutateAsync(input);
      reset();
      setSelectedProduct(null);
      await navigate(`/products/${values.productId}`);
    } catch (error) {
      setFormError(
        error instanceof ApiError
          ? messageForCode(error.code, error.message)
          : 'Não foi possível registrar o ajuste. Tente novamente.',
      );
    }
  }

  return (
    <form
      noValidate
      onSubmit={(event) => {
        void handleSubmit(onValidSubmit)(event);
      }}
      className="flex flex-col gap-4"
    >
      <FormField label="Produto" error={errors.productId?.message} required>
        {(field) => (
          <Controller
            name="productId"
            control={control}
            render={({ field: controllerField }) => (
              <ProductPicker
                id={field.id}
                value={selectedProduct}
                onChange={(product) => {
                  setSelectedProduct(product);
                  controllerField.onChange(product?.id ?? '');
                }}
                aria-describedby={field['aria-describedby']}
                aria-invalid={field['aria-invalid']}
              />
            )}
          />
        )}
      </FormField>

      {selectedProduct ? (
        <p className="text-xs text-muted-foreground">
          Saldo atual:{' '}
          <span className="font-mono">{formatQuantity(selectedProduct.currentStock)}</span> — o
          campo abaixo substitui esse valor, não soma a ele.
        </p>
      ) : null}

      <FormField
        label="Saldo final"
        error={errors.finalQuantity?.message}
        hint="Decimal com até 3 casas. É o saldo depois do ajuste, não a diferença."
        required
      >
        {(field) => <Input {...field} {...register('finalQuantity')} placeholder="0.000" />}
      </FormField>

      <FormField label="Documento de referência" error={errors.referenceDoc?.message}>
        {(field) => <Input {...field} {...register('referenceDoc')} />}
      </FormField>

      <FormField
        label="Justificativa"
        error={errors.note?.message}
        hint="Obrigatória: explique o motivo do ajuste manual."
        required
      >
        {(field) => <Input {...field} {...register('note')} />}
      </FormField>

      {formError !== null ? (
        <p
          role="alert"
          className="rounded-(--radius-md) border border-(--color-danger)/30 bg-(--color-danger)/10 px-3 py-2 text-xs text-(--color-danger)"
        >
          {formError}
        </p>
      ) : null}

      <Button type="submit" disabled={mutation.isPending} className="w-full sm:w-auto">
        {mutation.isPending ? 'Registrando…' : 'Registrar ajuste'}
      </Button>
    </form>
  );
}
