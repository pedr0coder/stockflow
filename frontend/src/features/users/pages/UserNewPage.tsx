import { zodResolver } from '@hookform/resolvers/zod';
import { useState, type ReactNode } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useNavigate } from 'react-router';
import { FormField } from '@/components/shared/FormField';
import { PageHeader } from '@/components/shared/PageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useCreateUserMutation } from '@/features/users/queries';
import { createUserSchema, type CreateUserFormValues } from '@/features/users/schemas';
import { ApiError } from '@/lib/api-client';
import { messageForCode } from '@/lib/error-messages';
import { ROLE_LABEL, USER_ROLES } from '@/types/auth';

export function UserNewPage(): ReactNode {
  const navigate = useNavigate();
  const [formError, setFormError] = useState<string | null>(null);
  const createMutation = useCreateUserMutation();

  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = useForm<CreateUserFormValues>({
    resolver: zodResolver(createUserSchema),
    defaultValues: { name: '', email: '', password: '', role: 'OPERATOR' },
    mode: 'onBlur',
  });

  async function onValidSubmit(values: CreateUserFormValues): Promise<void> {
    setFormError(null);

    try {
      const created = await createMutation.mutateAsync(values);
      await navigate(`/users/${created.id}`, { replace: true });
    } catch (error) {
      setFormError(
        error instanceof ApiError
          ? messageForCode(error.code, error.message)
          : 'Não foi possível cadastrar o usuário. Tente novamente.',
      );
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Novo usuário"
        breadcrumbs={[{ label: 'Usuários', to: '/users' }, { label: 'Novo usuário' }]}
      />

      <Card className="max-w-xl border shadow-none">
        <CardContent className="pt-6">
          <form
            noValidate
            onSubmit={(event) => {
              void handleSubmit(onValidSubmit)(event);
            }}
            className="flex flex-col gap-4"
          >
            <FormField label="Nome" error={errors.name?.message} required>
              {(field) => <Input {...field} {...register('name')} autoFocus />}
            </FormField>

            <FormField label="E-mail" error={errors.email?.message} required>
              {(field) => <Input {...field} {...register('email')} type="email" />}
            </FormField>

            <FormField
              label="Senha provisória"
              error={errors.password?.message}
              hint="Mínimo de 10 caracteres."
              required
            >
              {(field) => <Input {...field} {...register('password')} type="password" />}
            </FormField>

            <FormField label="Papel" error={errors.role?.message} required>
              {(field) => (
                <Controller
                  name="role"
                  control={control}
                  render={({ field: controllerField }) => (
                    <Select value={controllerField.value} onValueChange={controllerField.onChange}>
                      <SelectTrigger {...field} className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {USER_ROLES.map((role) => (
                          <SelectItem key={role} value={role}>
                            {ROLE_LABEL[role]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              )}
            </FormField>

            {formError !== null ? (
              <p
                role="alert"
                className="rounded-(--radius-md) border border-(--color-danger)/30 bg-(--color-danger)/10 px-3 py-2 text-xs text-(--color-danger)"
              >
                {formError}
              </p>
            ) : null}

            <div className="flex items-center gap-2">
              <Button type="button" variant="outline" onClick={() => void navigate('/users')}>
                Cancelar
              </Button>
              <Button type="submit" disabled={createMutation.isPending}>
                {createMutation.isPending ? 'Cadastrando…' : 'Cadastrar'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
