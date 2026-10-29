import { zodResolver } from '@hookform/resolvers/zod';
import { useState, type ReactNode } from 'react';
import { useForm } from 'react-hook-form';
import { FormField } from '@/components/shared/FormField';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import type { Category } from '@/features/categories/api';
import {
  useCreateCategoryMutation,
  useUpdateCategoryMutation,
} from '@/features/categories/queries';
import { categorySchema, type CategoryFormValues } from '@/features/categories/schemas';
import { ApiError } from '@/lib/api-client';
import { messageForCode } from '@/lib/error-messages';

export interface CategoryFormSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Ausente: formulário de criação. Presente: edição. */
  category?: Category | undefined;
  onSaved?: () => void;
}

/**
 * Formulário de categoria, como painel lateral.
 *
 * O mapa de telas não reserva rota própria de criação de categoria
 * (docs/18-plano-fase-6.md §18.3) — por isso um painel, não uma página.
 */
export function CategoryFormSheet({
  open,
  onOpenChange,
  category,
  onSaved,
}: CategoryFormSheetProps): ReactNode {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        {/* `key` força o React a remontar o formulário ao trocar de
            categoria (ou entre editar e criar), em vez de um `useEffect`
            chamando `reset()` — o valor inicial certo já nasce no primeiro
            render, sem o ciclo extra de "montar vazio, depois repovoar". */}
        <CategoryForm
          key={category?.id ?? 'new'}
          category={category}
          onCancel={() => onOpenChange(false)}
          onSaved={() => {
            onOpenChange(false);
            onSaved?.();
          }}
        />
      </SheetContent>
    </Sheet>
  );
}

function CategoryForm({
  category,
  onCancel,
  onSaved,
}: {
  category: Category | undefined;
  onCancel: () => void;
  onSaved: () => void;
}): ReactNode {
  const isEditing = category !== undefined;
  const [formError, setFormError] = useState<string | null>(null);
  const createMutation = useCreateCategoryMutation();
  const updateMutation = useUpdateCategoryMutation();
  const isPending = createMutation.isPending || updateMutation.isPending;

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<CategoryFormValues>({
    resolver: zodResolver(categorySchema),
    defaultValues: { name: category?.name ?? '', description: category?.description ?? '' },
    mode: 'onBlur',
  });

  async function onValidSubmit(values: CategoryFormValues): Promise<void> {
    setFormError(null);

    const input = {
      name: values.name,
      ...(values.description && values.description.length > 0
        ? { description: values.description }
        : {}),
    };

    try {
      if (isEditing) {
        await updateMutation.mutateAsync({ id: category.id, input });
      } else {
        await createMutation.mutateAsync(input);
      }

      onSaved();
    } catch (error) {
      setFormError(
        error instanceof ApiError
          ? messageForCode(error.code, error.message)
          : 'Não foi possível salvar a categoria. Tente novamente.',
      );
    }
  }

  return (
    <>
      <SheetHeader>
        <SheetTitle>{isEditing ? 'Editar categoria' : 'Nova categoria'}</SheetTitle>
        <SheetDescription>
          {isEditing
            ? 'Altere o nome ou a descrição da categoria.'
            : 'Categorias classificam os produtos do estoque.'}
        </SheetDescription>
      </SheetHeader>

      <form
        noValidate
        onSubmit={(event) => {
          void handleSubmit(onValidSubmit)(event);
        }}
        className="flex flex-1 flex-col gap-4 overflow-y-auto px-4"
      >
        <FormField label="Nome" error={errors.name?.message} required>
          {(field) => <Input {...field} {...register('name')} autoFocus />}
        </FormField>

        <FormField label="Descrição" error={errors.description?.message}>
          {(field) => <Input {...field} {...register('description')} />}
        </FormField>

        {formError !== null ? (
          <p
            role="alert"
            className="rounded-(--radius-md) border border-(--color-danger)/30 bg-(--color-danger)/10 px-3 py-2 text-xs text-(--color-danger)"
          >
            {formError}
          </p>
        ) : null}

        <SheetFooter className="mt-auto px-0">
          <Button type="button" variant="outline" onClick={onCancel} disabled={isPending}>
            Cancelar
          </Button>
          <Button type="submit" disabled={isPending}>
            {isPending ? 'Salvando…' : 'Salvar'}
          </Button>
        </SheetFooter>
      </form>
    </>
  );
}
