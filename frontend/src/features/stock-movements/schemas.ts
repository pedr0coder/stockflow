import { z } from 'zod';
import { REASONS_BY_TYPE, type MovementTypeValue } from '@/features/stock-movements/api';

/** Mesmo padrão decimal do backend (3 casas) — `common/utils` via `@IsPositiveQuantity`. */
const QUANTITY_PATTERN = /^\d+(\.\d{1,3})?$/;

/**
 * Esquema de entrada/saída, parametrizado pelo tipo: o motivo válido depende
 * de qual aba (entrada/saída) está aberta, e o backend recusa qualquer outra
 * combinação com `INVALID_TYPE_REASON` (422) — aqui é só feedback imediato,
 * a regra de verdade continua no servidor.
 */
export function createMovementSchema(type: Extract<MovementTypeValue, 'IN' | 'OUT'>) {
  return z.object({
    productId: z.string().trim().min(1, 'Selecione um produto.'),
    quantity: z
      .string()
      .trim()
      .regex(QUANTITY_PATTERN, 'Use um decimal maior que zero, com até 3 casas, como "10.000".')
      .refine((value) => Number.parseFloat(value) > 0, 'A quantidade deve ser maior que zero.'),
    reason: z.enum(REASONS_BY_TYPE[type], {
      message: 'Selecione um motivo válido para este tipo.',
    }),
    referenceDoc: z
      .string()
      .trim()
      .max(80, 'No máximo 80 caracteres.')
      .optional()
      .or(z.literal('')),
    note: z.string().trim().max(500, 'No máximo 500 caracteres.').optional().or(z.literal('')),
  });
}

export type MovementFormValues = z.infer<ReturnType<typeof createMovementSchema>>;

/**
 * Ajuste manual: `finalQuantity` é o saldo final absoluto, não uma
 * quantidade a somar/subtrair — e aceita zero. O motivo só pode ser
 * `CORRECTION` (a única razão de ajuste manual; `INVENTORY_ADJUSTMENT` é
 * reservado à aprovação de inventário). A nota é obrigatória: é a
 * justificativa de uma alteração que não decorre de nenhuma movimentação de
 * negócio normal.
 */
export const adjustmentSchema = z.object({
  productId: z.string().trim().min(1, 'Selecione um produto.'),
  finalQuantity: z
    .string()
    .trim()
    .regex(QUANTITY_PATTERN, 'Use um decimal com até 3 casas, como "10.000".'),
  reason: z.literal('CORRECTION'),
  referenceDoc: z.string().trim().max(80, 'No máximo 80 caracteres.').optional().or(z.literal('')),
  note: z
    .string()
    .trim()
    .min(3, 'Justifique o ajuste em pelo menos 3 caracteres.')
    .max(500, 'No máximo 500 caracteres.'),
});

export type AdjustmentFormValues = z.infer<typeof adjustmentSchema>;
