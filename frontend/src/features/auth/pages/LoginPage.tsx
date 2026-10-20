import { zodResolver } from '@hookform/resolvers/zod';
import { Eye, EyeOff, Info } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router';
import { FormField } from '@/components/shared/FormField';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { useUiPreview } from '@/features/auth/auth-context';
import { loginSchema, type LoginFormValues } from '@/features/auth/schemas';
import { ROLE_LABEL, USER_ROLES, type UserRole } from '@/types/auth';

/**
 * Tela de login.
 *
 * O formulário é real: valida com Zod, mostra erro junto ao campo e bloqueia
 * envio inválido. O que ele **não** faz é autenticar, porque não existe
 * autenticação ainda (Fase 4) nem integração (Fase 6).
 *
 * Em vez de fingir, a tela diz o que acontece. Submeter exibe uma mensagem
 * declarando que a autenticação ainda não existe, e quem quiser ver a
 * interface usa o bloco separado logo abaixo, nomeado como pré-visualização.
 *
 * A alternativa seria aceitar qualquer credencial e criar uma sessão, que é
 * exatamente o tipo de simulação que este projeto não faz.
 */
export function LoginPage(): ReactNode {
  const navigate = useNavigate();
  const { startPreview } = useUiPreview();

  const [showPassword, setShowPassword] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [previewRole, setPreviewRoleChoice] = useState<UserRole>('OPERATOR');

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

  function onValidSubmit(): void {
    // Nenhuma sessão é criada aqui. Ver o comentário no topo do arquivo.
    setSubmitted(true);
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
              (§6.4). */}
          <Button type="submit" disabled={isSubmitting} className="w-full">
            Entrar
          </Button>

          {submitted ? (
            <p
              role="status"
              className="rounded-(--radius-md) border border-(--color-warning)/30 bg-(--color-warning)/10 px-3 py-2 text-xs text-(--color-warning)"
            >
              A autenticação ainda não foi implementada. Ela é entrega da Fase 4, e a ligação com a
              API é da Fase 6. Nenhuma sessão foi criada.
            </p>
          ) : null}
        </form>

        <Separator />

        <PreviewAccess
          role={previewRole}
          onRoleChange={setPreviewRoleChoice}
          onStart={() => {
            startPreview(previewRole);
            void navigate('/dashboard');
          }}
        />
      </CardContent>
    </Card>
  );
}

/**
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ SERÁ DELETADO NA FASE 6, junto com o provider de pré-visualização.       │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Entrada para a pré-visualização da interface.
 *
 * Separado do formulário por um divisor, com rótulo próprio e explicação do
 * que é. Não há como confundir com o botão de entrar.
 */
function PreviewAccess({
  role,
  onRoleChange,
  onStart,
}: {
  role: UserRole;
  onRoleChange: (role: UserRole) => void;
  onStart: () => void;
}): ReactNode {
  return (
    <section aria-labelledby="preview-title" className="flex flex-col gap-3">
      <div className="flex items-start gap-2">
        <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        <div className="flex flex-col gap-1">
          <h2 id="preview-title" className="text-sm font-medium">
            Visualizar a interface (sem backend)
          </h2>
          <p className="text-xs text-muted-foreground">
            Navega pelo design system da Fase 3. Não autentica ninguém, não consulta a API e não
            exibe dado real. Recarregar a página volta para cá.
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="flex-1">
          <label htmlFor="preview-role-login" className="sr-only">
            Papel para a pré-visualização
          </label>
          <Select
            value={role}
            onValueChange={(value) => {
              onRoleChange(value as UserRole);
            }}
          >
            <SelectTrigger id="preview-role-login" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {USER_ROLES.map((item) => (
                <SelectItem key={item} value={item}>
                  {ROLE_LABEL[item]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Button type="button" variant="outline" onClick={onStart}>
          Visualizar interface
        </Button>
      </div>
    </section>
  );
}
