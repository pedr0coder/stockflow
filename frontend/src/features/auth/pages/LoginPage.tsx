import { zodResolver } from '@hookform/resolvers/zod';
import { Eye, EyeOff } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { useForm } from 'react-hook-form';
import { useLocation, useNavigate } from 'react-router';
import { FormField } from '@/components/shared/FormField';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/features/auth/auth-context';
import { loginSchema, type LoginFormValues } from '@/features/auth/schemas';
import { ApiError } from '@/lib/api-client';

/**
 * Tela de login.
 *
 * Formulário real: valida com Zod, mostra erro junto ao campo, bloqueia
 * envio inválido e, ao submeter, chama `POST /auth/login` de verdade
 * (`AuthProvider.signIn`). A pré-visualização de interface da Fase 3 foi
 * removida nesta fase, como `docs/14-relatorio-fase-3.md §14.10.3` já previa.
 */
export function LoginPage(): ReactNode {
  const navigate = useNavigate();
  const location = useLocation();
  const { signIn } = useAuth();

  const [showPassword, setShowPassword] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
    // Valida ao sair do campo, e não a cada tecla: validar enquanto a pessoa
    // ainda está digitando mostra "e-mail inválido" no terceiro caractere.
    mode: 'onBlur',
  });

  async function onValidSubmit(values: LoginFormValues): Promise<void> {
    setFormError(null);

    try {
      await signIn(values.email, values.password);

      // `location.state.from` vem do `ProtectedRoute`: quem tentou abrir uma
      // rota protegida sem sessão volta exatamente para onde ia, em vez de
      // sempre cair no dashboard.
      const state = location.state as { from?: string } | null;
      await navigate(state?.from ?? '/dashboard', { replace: true });
    } catch (error) {
      // 401 de credencial errada é o caminho esperado aqui — nunca um erro
      // não tratado. Qualquer outro problema (rede, 500) usa a mesma
      // mensagem genérica: a tela de login não distingue "e-mail não existe"
      // de "senha errada" (docs/08-seguranca.md, não permitir enumeração).
      setFormError(
        error instanceof ApiError && error.status === 401
          ? 'E-mail ou senha incorretos.'
          : 'Não foi possível entrar. Tente novamente.',
      );
    }
  }

  return (
    <Card className="border shadow-none">
      <CardHeader>
        <CardTitle className="text-xl">Entrar</CardTitle>
        <CardDescription>Acesse com suas credenciais do StockFlow.</CardDescription>
      </CardHeader>

      <CardContent className="flex flex-col gap-6">
        <form
          noValidate
          onSubmit={(event) => {
            void handleSubmit(onValidSubmit)(event);
          }}
          className="flex flex-col gap-4"
        >
          <FormField label="E-mail" error={errors.email?.message} required>
            {(field) => (
              <Input
                {...field}
                {...register('email')}
                type="email"
                autoComplete="username"
                placeholder="voce@empresa.com.br"
              />
            )}
          </FormField>

          <FormField
            label="Senha"
            error={errors.password?.message}
            hint="Mínimo de 10 caracteres."
            required
          >
            {(field) => (
              <div className="relative">
                <Input
                  {...field}
                  {...register('password')}
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => {
                    setShowPassword((value) => !value);
                  }}
                  className="absolute inset-y-0 right-0 flex w-10 items-center justify-center rounded-(--radius-md) text-muted-foreground hover:text-foreground"
                  aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                >
                  {showPassword ? (
                    <EyeOff aria-hidden="true" className="size-4" />
                  ) : (
                    <Eye aria-hidden="true" className="size-4" />
                  )}
                </button>
              </div>
            )}
          </FormField>

          {/* Botão desabilitado durante o envio, para impedir duplo submit
              (§6.4) — reduz o acidente do mesmo clique, não é garantia de
              requisição única (docs/18-plano-fase-6.md §18.9). */}
          <Button type="submit" disabled={isSubmitting} className="w-full">
            {isSubmitting ? 'Entrando…' : 'Entrar'}
          </Button>

          {formError !== null ? (
            <p
              role="alert"
              className="rounded-(--radius-md) border border-(--color-danger)/30 bg-(--color-danger)/10 px-3 py-2 text-xs text-(--color-danger)"
            >
              {formError}
            </p>
          ) : null}
        </form>
      </CardContent>
    </Card>
  );
}
