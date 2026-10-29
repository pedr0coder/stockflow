import { z } from 'zod';

/**
 * Espelha `CreateCategoryDto` (backend/src/categories/dto/create-category.dto.ts):
 * mesmos limites, para erro imediato sem ida ao servidor — mas quem decide de
 * fato continua sendo o backend (docs/18-plano-fase-6.md §18.10).
 */
export const categorySchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, 'Informe pelo menos 2 caracteres.')
    .max(80, 'No máximo 80 caracteres.'),
  description: z.string().trim().max(500, 'No máximo 500 caracteres.').optional().or(z.literal('')),
});

export type CategoryFormValues = z.infer<typeof categorySchema>;
