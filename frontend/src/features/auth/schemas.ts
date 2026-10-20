import { z } from 'zod';
import { MAX_EMAIL_LENGTH, MIN_PASSWORD_LENGTH } from '@/lib/validation-rules';

/**
 * Schema do formulário de login.
 *
 * As mensagens estão em português porque elas vão direto para a tela, ao lado
 * do campo. Nenhuma delas revela se o e-mail existe: dizer "usuário não
 * encontrado" permitiria enumerar contas.
 */
export const loginSchema = z.object({
  email: z
    .string()
    .trim()
    // Normalizado para minúsculas antes de enviar, como o servidor faz antes
    // de gravar (docs/04-banco-de-dados.md §4.4). Sem isso, "Ana@x.com" e
    // "ana@x.com" pareceriam contas diferentes para quem digita.
    .toLowerCase()
    .min(1, 'Informe o e-mail.')
    .max(MAX_EMAIL_LENGTH, `O e-mail deve ter no máximo ${MAX_EMAIL_LENGTH} caracteres.`)
    .email('Informe um e-mail válido.'),

  password: z
    .string()
    .min(1, 'Informe a senha.')
    .min(MIN_PASSWORD_LENGTH, `A senha deve ter no mínimo ${MIN_PASSWORD_LENGTH} caracteres.`),
});

export type LoginFormValues = z.infer<typeof loginSchema>;
