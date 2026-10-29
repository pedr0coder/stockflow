import { z } from 'zod';
import { USER_ROLES } from '@/types/auth';

export const createUserSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, 'Informe pelo menos 2 caracteres.')
    .max(120, 'No máximo 120 caracteres.'),
  email: z.string().trim().email('Informe um e-mail válido.').max(180),
  password: z.string().min(10, 'Mínimo de 10 caracteres.').max(128, 'No máximo 128 caracteres.'),
  role: z.enum(USER_ROLES, { message: 'Selecione um papel.' }),
});

export type CreateUserFormValues = z.infer<typeof createUserSchema>;

/** Espelha `UpdateUserDto`: só nome e e-mail — papel e senha têm fluxo próprio. */
export const updateUserSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, 'Informe pelo menos 2 caracteres.')
    .max(120, 'No máximo 120 caracteres.'),
  email: z.string().trim().email('Informe um e-mail válido.').max(180),
});

export type UpdateUserFormValues = z.infer<typeof updateUserSchema>;
