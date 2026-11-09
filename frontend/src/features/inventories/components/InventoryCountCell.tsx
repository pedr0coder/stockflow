import { useId, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { InventoryItem } from '@/features/inventories/api';
import { useCountItemMutation } from '@/features/inventories/queries';
import { countSchema } from '@/features/inventories/schemas';
import { ApiError } from '@/lib/api-client';
import { messageForCode } from '@/lib/error-messages';
import { formatQuantity } from '@/lib/format';

export interface InventoryCountCellProps {
  inventoryId: string;
  item: InventoryItem;
  /** Falso fora de `OPEN`/`COUNTING` — o backend recusa a contagem, o campo nem tenta. */
  canCount: boolean;
}

/**
 * Campo de contagem por item. Recontagem é permitida de propósito
 * (backend/src/inventories/dto/count-item.dto.ts): a pessoa pode errar e
 * digitar de novo antes de enviar para aprovação, e o valor novo substitui o
 * anterior sem aviso — é a mesma contagem, só corrigida.
 */
export function InventoryCountCell({
  inventoryId,
  item,
  canCount,
}: InventoryCountCellProps): ReactNode {
  const [value, setValue] = useState(item.countedQty ?? '');
  const [fieldError, setFieldError] = useState<string | null>(null);
  const errorId = useId();
  const mutation = useCountItemMutation(inventoryId);

  const labelTarget =
    item.productName !== undefined && item.productName.length > 0
      ? item.productSku !== undefined && item.productSku.length > 0
        ? `${item.productName} (${item.productSku})`
        : item.productName
      : `o item ${item.id}`;

  async function save(): Promise<void> {
    const parsed = countSchema.safeParse({ countedQty: value });

    if (!parsed.success) {
      setFieldError(parsed.error.issues[0]?.message ?? 'Valor inválido.');
      return;
    }

    setFieldError(null);

    try {
      await mutation.mutateAsync({ itemId: item.id, countedQty: parsed.data.countedQty });
      toast.success('Contagem registrada.');
    } catch (error) {
      toast.error(
        error instanceof ApiError
          ? messageForCode(error.code, error.message)
          : 'Não foi possível registrar a contagem.',
      );
    }
  }

  if (!canCount) {
    return (
      <span className="font-mono">
        {item.countedQty !== null ? formatQuantity(item.countedQty) : '—'}
      </span>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-1.5">
        <Input
          value={value}
          onChange={(event) => {
            setValue(event.target.value);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !mutation.isPending && value.length > 0) {
              event.preventDefault();
              void save();
            }
          }}
          placeholder="0.000"
          className="h-8 w-24 font-mono"
          aria-label={`Quantidade contada para ${labelTarget}`}
          aria-invalid={fieldError !== null}
          {...(fieldError !== null ? { 'aria-describedby': errorId } : {})}
        />
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={mutation.isPending || value.length === 0}
          onClick={() => void save()}
        >
          {mutation.isPending ? 'Salvando…' : 'Salvar'}
        </Button>
      </div>
      {fieldError !== null ? (
        <span id={errorId} role="alert" className="text-xs text-(--color-danger)">
          {fieldError}
        </span>
      ) : null}
    </div>
  );
}
