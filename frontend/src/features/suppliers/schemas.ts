import { z } from 'zod';

/**
 * Espelha `CreateSupplierDto` (backend/src/suppliers/dto/supplier.dto.ts):
 * mesmo padrão de CNPJ/CPF, mesmos limites — conferido direto no DTO, não
 * reconstruído de memória.
 */
const TAX_ID_PATTERN = /^(\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}|\d{3}\.\d{3}\.\d{3}-\d{2})$/;

const optionalText = (max: number, message: string) =>
  z.string().trim().max(max, message).optional().or(z.literal(''));

export const supplierSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, 'Informe pelo menos 2 caracteres.')
    .max(140, 'No máximo 140 caracteres.'),
  taxId: z
    .string()
    .trim()
    .regex(TAX_ID_PATTERN, 'Informe um CNPJ (00.000.000/0000-00) ou CPF (000.000.000-00).')
    .optional()
    .or(z.literal('')),
  email: z.string().trim().email('Informe um e-mail válido.').max(180).optional().or(z.literal('')),
  phone: optionalText(30, 'No máximo 30 caracteres.'),
  notes: optionalText(1000, 'No máximo 1000 caracteres.'),
});

export type SupplierFormValues = z.infer<typeof supplierSchema>;
