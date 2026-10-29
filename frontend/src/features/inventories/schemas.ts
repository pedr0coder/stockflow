import { z } from 'zod';

const QUANTITY_PATTERN = /^\d+(\.\d{1,3})?$/;

/** Espelha `CountItemDto`: valor absoluto, zero ou maior, até 3 casas. */
export const countSchema = z.object({
  countedQty: z
    .string()
    .trim()
    .regex(QUANTITY_PATTERN, 'Use um decimal com até 3 casas, como "12.500".'),
});

export type CountFormValues = z.infer<typeof countSchema>;

/** Espelha `OpenInventoryDto`. `productIds` é validado à parte (1–200), pela seleção na tela. */
export const openInventorySchema = z.object({
  note: z.string().trim().max(500, 'No máximo 500 caracteres.').optional().or(z.literal('')),
});

export type OpenInventoryFormValues = z.infer<typeof openInventorySchema>;

export const MAX_INVENTORY_PRODUCTS = 200;
