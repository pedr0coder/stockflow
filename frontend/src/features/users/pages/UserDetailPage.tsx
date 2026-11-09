import { zodResolver } from '@hookform/resolvers/zod';
import { useState, type ReactNode } from 'react';
import { useForm } from 'react-hook-form';
import { useParams } from 'react-router';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { ErrorState } from '@/components/shared/ErrorState';
import { FormField } from '@/components/shared/FormField';
import { PageHeader } from '@/components/shared/PageHeader';
import { Badge } from '@/components/ui/badge';
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
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/features/auth/auth-context';
import {
  useChangeUserRoleMutation,
  useChangeUserStatusMutation,
  useUpdateUserMutation,
  useUserQuery,
} from '@/features/users/queries';
import { updateUserSchema, type UpdateUserFormValues } from '@/features/users/schemas';
import { ApiError } from '@/lib/api-client';
import { messageForCode } from '@/lib/error-messages';
import { formatDateTime } from '@/lib/format';
import { ROLE_LABEL, USER_ROLES, type UserRole } from '@/types/auth';

export function UserDetailPage(): ReactNode {
  const { id } = useParams<{ id: string }>();
  const userId = id ?? '';
  const { user: currentUser } = useAuth();
  const isAdmin = currentUser?.role === 'ADMIN';
  const isSelf = currentUser?.id === userId;

  const [isEditing, setIsEditing] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const { data: targetUser, isPending, isError, error, refetch } = useUserQuery(userId);
  const updateMutation = useUpdateUserMutation(userId);
  const roleMutation = useChangeUserRoleMutation();
  const statusMutation = useChangeUserStatusMutation();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<UpdateUserFormValues>({
    resolver: zodResolver(updateUserSchema),
    ...(targetUser ? { values: { name: targetUser.name, email: targetUser.email } } : {}),
    mode: 'onBlur',
  });

  if (isPending) {
    return (
      <div className="flex flex-col gap-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-48 w-full max-w-xl" />
      </div>
    );
  }

  if (isError || targetUser === undefined) {
    return (
      <ErrorState
        {...(error instanceof ApiError && error.code !== undefined ? { code: error.code } : {})}
        onRetry={() => void refetch()}
      />
    );
  }

  async function handleSave(values: UpdateUserFormValues): Promise<void> {
    setFormError(null);

    try {
      await updateMutation.mutateAsync(values);
      setIsEditing(false);
    } catch (err) {
      setFormError(
        err instanceof ApiError
          ? messageForCode(err.code, err.message)
          : 'Não foi possível salvar o usuário. Tente novamente.',
      );
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={targetUser.name}
        breadcrumbs={[{ label: 'Usuários', to: '/users' }, { label: targetUser.name }]}
        action={
          isAdmin && !isEditing ? (
            <Button
              variant="outline"
              onClick={() => {
                setIsEditing(true);
              }}
            >
              Editar
            </Button>
          ) : undefined
        }
      />

      <Card className="max-w-xl border shadow-none">
        <CardContent className="pt-6">
          {isEditing ? (
            <form
              noValidate
              onSubmit={(event) => {
                void handleSubmit(handleSave)(event);
              }}
              className="flex flex-col gap-4"
            >
              <FormField label="Nome" error={errors.name?.message} required>
                {(field) => <Input {...field} {...register('name')} autoFocus />}
              </FormField>

              <FormField label="E-mail" error={errors.email?.message} required>
                {(field) => <Input {...field} {...register('email')} type="email" />}
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
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setIsEditing(false);
                    setFormError(null);
                  }}
                  disabled={updateMutation.isPending}
                >
                  Cancelar
                </Button>
                <Button type="submit" disabled={updateMutation.isPending}>
                  {updateMutation.isPending ? 'Salvando…' : 'Salvar'}
                </Button>
              </div>
            </form>
          ) : (
            <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <dt className="text-xs text-muted-foreground">E-mail</dt>
                <dd className="break-all">{targetUser.email}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Situação</dt>
                <dd>
                  {targetUser.isActive ? (
                    <Badge variant="outline" className="font-normal">
                      Ativo
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="border-transparent bg-muted font-normal">
                      Inativo
                    </Badge>
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Último acesso</dt>
                <dd>
                  {targetUser.lastLoginAt !== null
                    ? formatDateTime(targetUser.lastLoginAt)
                    : 'Nunca'}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Cadastrado em</dt>
                <dd>{formatDateTime(targetUser.createdAt)}</dd>
              </div>
            </dl>
          )}
        </CardContent>
      </Card>

      {isAdmin ? (
        <Card className="max-w-xl border shadow-none">
          <CardContent className="flex flex-col gap-4 pt-6">
            <h2 className="text-sm font-medium">Papel e acesso</h2>

            <div className="flex flex-wrap items-center gap-3">
              <Select
                value={targetUser.role}
                disabled={roleMutation.isPending}
                onValueChange={(value) => {
                  if (value === targetUser.role) {
                    return;
                  }

                  roleMutation.mutate(
                    { id: userId, role: value as UserRole },
                    {
                      onSuccess: () => {
                        toast.success('Papel atualizado.');
                      },
                      onError: (err) => {
                        toast.error(
                          err instanceof ApiError
                            ? messageForCode(err.code, err.message)
                            : 'Não foi possível alterar o papel.',
                        );
                      },
                    },
                  );
                }}
              >
                <SelectTrigger className="w-full sm:w-48" aria-label="Papel do usuário">
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

              <ConfirmDialog
                trigger={
                  <Button variant="outline" disabled={isSelf}>
                    {targetUser.isActive ? 'Inativar' : 'Ativar'}
                  </Button>
                }
                title={
                  targetUser.isActive
                    ? `Inativar o acesso de ${targetUser.name}?`
                    : `Ativar o acesso de ${targetUser.name}?`
                }
                description={
                  targetUser.isActive
                    ? 'A pessoa deixa de conseguir entrar no sistema imediatamente.'
                    : 'A pessoa volta a conseguir entrar no sistema.'
                }
                destructive={targetUser.isActive}
                onConfirm={async () => {
                  try {
                    await statusMutation.mutateAsync({
                      id: userId,
                      isActive: !targetUser.isActive,
                    });
                    toast.success('Situação atualizada.');
                  } catch (err) {
                    toast.error(
                      err instanceof ApiError
                        ? messageForCode(err.code, err.message)
                        : 'Não foi possível alterar a situação.',
                    );
                  }
                }}
              />
            </div>

            {isSelf ? (
              <p className="text-xs text-muted-foreground">
                Você não pode inativar a própria conta por aqui.
              </p>
            ) : null}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
