import { z } from 'zod';
import { UNITS_OF_MEASURE } from '@/features/products/api';

/**
 * Espelha `CreateProductDto` (backend/src/products/dto/product.dto.ts): os
 * mesmos padrões decimais do backend, incluindo a escala (3 casas em
 * quantidade, 4 em custo) — nunca `number`, sempre string, pelo mesmo motivo
 * do servidor (docs/05-api.md §5.7).
 */
const QUANTITY_PATTERN = /^\d+(\.\d{1,3})?$/;
const COST_PATTERN = /^\d+(\.\d{1,4})?$/;

export const productSchema = z.object({
  sku: z
    .string()
    .trim()
    .min(2, 'Informe pelo menos 2 caracteres.')
    .max(40, 'No máximo 40 caracteres.'),
  name: z
    .string()
    .trim()
    .min(2, 'Informe pelo menos 2 caracteres.')
    .max(160, 'No máximo 160 caracteres.'),
  description: z
    .string()
    .trim()
    .max(1000, 'No máximo 1000 caracteres.')
    .optional()
    .or(z.literal('')),
  categoryId: z.string().trim().min(1, 'Selecione uma categoria.'),
  supplierId: z.string().trim().optional().or(z.literal('')),
  unit: z.enum(UNITS_OF_MEASURE, { message: 'Selecione uma unidade de medida.' }),
  minStock: z
    .string()
    .trim()
    .regex(QUANTITY_PATTERN, 'Use um decimal com até 3 casas, como "10.000".')
    .optional()
    .or(z.literal('')),
  unitCost: z
    .string()
    .trim()
    .regex(COST_PATTERN, 'Use um decimal com até 4 casas, como "12.9000".')
    .optional()
    .or(z.literal('')),
});

export type ProductFormValues = z.infer<typeof productSchema>;
