import { zodResolver } from '@hookform/resolvers/zod';
import { useState, type ReactNode } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useNavigate } from 'react-router';
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
import { ProductPicker } from '@/features/products/components/ProductPicker';
import type { Product } from '@/features/products/api';
import { REASONS_BY_TYPE, REASON_LABEL } from '@/features/stock-movements/api';
import {
  useCreateInMovementMutation,
  useCreateOutMovementMutation,
} from '@/features/stock-movements/queries';
import { createMovementSchema, type MovementFormValues } from '@/features/stock-movements/schemas';
import { ApiError } from '@/lib/api-client';
import { messageForCode } from '@/lib/error-messages';
import { formatQuantity } from '@/lib/format';

export interface MovementEntryFormProps {
  type: 'IN' | 'OUT';
}

/**
 * Formulário de entrada ou saída — mesmos campos, muda só o tipo (que decide
 * o endpoint e os motivos válidos). 409 `INSUFFICIENT_STOCK` (só em saída) e
 * `PRODUCT_INACTIVE` chegam com `available`/`requested` reais, exibidos
 * junto ao campo de quantidade, não só em toast (docs/18-plano-fase-6.md
 * §18.9).
 */
export function MovementEntryForm({ type }: MovementEntryFormProps): ReactNode {
  const navigate = useNavigate();
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const inMutation = useCreateInMovementMutation();
  const outMutation = useCreateOutMovementMutation();
  const mutation = type === 'IN' ? inMutation : outMutation;

  const schema = createMovementSchema(type);
  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors },
  } = useForm<MovementFormValues>({
    resolver: zodResolver(schema),
    // `reason` fica de fora de propósito: não há valor inicial válido (o
    // motivo depende do tipo, e nenhum é "o padrão") — a pessoa escolhe.
    defaultValues: { productId: '', quantity: '', referenceDoc: '', note: '' },
    mode: 'onBlur',
  });

  async function onValidSubmit(values: MovementFormValues): Promise<void> {
    setFormError(null);

    const input = {
      productId: values.productId,
      quantity: values.quantity,
      reason: values.reason,
      ...(values.referenceDoc ? { referenceDoc: values.referenceDoc } : {}),
      ...(values.note ? { note: values.note } : {}),
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
          : `Não foi possível registrar a ${type === 'IN' ? 'entrada' : 'saída'}. Tente novamente.`,
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
          <span className="font-mono">{formatQuantity(selectedProduct.currentStock)}</span>
        </p>
      ) : null}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <FormField
          label="Quantidade"
          error={errors.quantity?.message}
          hint="Decimal com até 3 casas."
          required
        >
          {(field) => <Input {...field} {...register('quantity')} placeholder="0.000" />}
        </FormField>

        <FormField label="Motivo" error={errors.reason?.message} required>
          {(field) => (
            <Controller
              name="reason"
              control={control}
              render={({ field: controllerField }) => (
                <Select
                  value={controllerField.value ?? ''}
                  onValueChange={controllerField.onChange}
                >
                  <SelectTrigger id={field.id} className="w-full">
                    <SelectValue placeholder="Selecione o motivo" />
                  </SelectTrigger>
                  <SelectContent>
                    {REASONS_BY_TYPE[type].map((reason) => (
                      <SelectItem key={reason} value={reason}>
                        {REASON_LABEL[reason]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          )}
        </FormField>
      </div>

      <FormField label="Documento de referência" error={errors.referenceDoc?.message}>
        {(field) => (
          <Input {...field} {...register('referenceDoc')} placeholder="Nota fiscal, pedido…" />
        )}
      </FormField>

      <FormField label="Observação" error={errors.note?.message}>
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
        {mutation.isPending
          ? 'Registrando…'
          : type === 'IN'
            ? 'Registrar entrada'
            : 'Registrar saída'}
      </Button>
    </form>
  );
}
