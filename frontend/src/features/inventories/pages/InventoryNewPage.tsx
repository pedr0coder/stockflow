import { zodResolver } from '@hookform/resolvers/zod';
import { X } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router';
import { FormField } from '@/components/shared/FormField';
import { PageHeader } from '@/components/shared/PageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import type { Product } from '@/features/products/api';
import { useProductsQuery } from '@/features/products/queries';
import { useOpenInventoryMutation } from '@/features/inventories/queries';
import {
  MAX_INVENTORY_PRODUCTS,
  openInventorySchema,
  type OpenInventoryFormValues,
} from '@/features/inventories/schemas';
import { ApiError } from '@/lib/api-client';
import { messageForCode } from '@/lib/error-messages';
import { useDebouncedValue } from '@/lib/use-debounced-value';

export function InventoryNewPage(): ReactNode {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search, 300);
  const [selected, setSelected] = useState<readonly Product[]>([]);
  const [formError, setFormError] = useState<string | null>(null);
  const openMutation = useOpenInventoryMutation();

  const searchQuery = useProductsQuery({
    page: 1,
    limit: 10,
    isActive: true,
    ...(debouncedSearch.length > 0 ? { search: debouncedSearch } : {}),
  });

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<OpenInventoryFormValues>({
    resolver: zodResolver(openInventorySchema),
    defaultValues: { note: '' },
  });

  const atLimit = selected.length >= MAX_INVENTORY_PRODUCTS;
  const selectedIds = new Set(selected.map((product) => product.id));

  function addProduct(product: Product): void {
    if (atLimit || selectedIds.has(product.id)) {
      return;
    }

    setSelected((current) => [...current, product]);
  }

  function removeProduct(productId: string): void {
    setSelected((current) => current.filter((product) => product.id !== productId));
  }

  async function onValidSubmit(values: OpenInventoryFormValues): Promise<void> {
    setFormError(null);

    if (selected.length === 0) {
      setFormError('Selecione ao menos um produto.');
      return;
    }

    try {
      const inventory = await openMutation.mutateAsync({
        productIds: selected.map((product) => product.id),
        ...(values.note ? { note: values.note } : {}),
      });
      await navigate(`/inventories/${inventory.id}`, { replace: true });
    } catch (error) {
      setFormError(
        error instanceof ApiError
          ? messageForCode(error.code, error.message)
          : 'Não foi possível abrir o inventário. Tente novamente.',
      );
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Novo inventário"
        breadcrumbs={[{ label: 'Inventários', to: '/inventories' }, { label: 'Novo inventário' }]}
      />

      <form
        noValidate
        onSubmit={(event) => {
          void handleSubmit(onValidSubmit)(event);
        }}
        className="flex flex-col gap-6"
      >
        <Card className="border shadow-none">
          <CardContent className="flex flex-col gap-4 pt-6">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-medium">Produtos a contar</h2>
              <span
                className={
                  atLimit
                    ? 'text-xs font-medium text-(--color-warning)'
                    : 'text-xs text-muted-foreground'
                }
              >
                {selected.length} / {MAX_INVENTORY_PRODUCTS}
              </span>
            </div>

            <Input
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
              }}
              placeholder="Buscar por SKU ou nome para adicionar…"
              disabled={atLimit}
              aria-label="Buscar produto para adicionar ao inventário"
            />

            {search.length > 0 ? (
              <ul className="flex flex-col divide-y rounded-(--radius-md) border">
                {searchQuery.isPending ? (
                  <li className="px-3 py-2 text-sm text-muted-foreground">Buscando…</li>
                ) : searchQuery.data?.data.length === 0 ? (
                  <li className="px-3 py-2 text-sm text-muted-foreground">
                    Nenhum produto ativo encontrado.
                  </li>
                ) : (
                  searchQuery.data?.data.map((product) => {
                    const alreadySelected = selectedIds.has(product.id);

                    return (
                      <li
                        key={product.id}
                        className="flex items-center justify-between gap-2 px-3 py-2"
                      >
                        <span className="flex items-center gap-2 text-sm">
                          <span className="font-mono text-xs text-muted-foreground">
                            {product.sku}
                          </span>
                          {product.name}
                        </span>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={alreadySelected || atLimit}
                          onClick={() => {
                            addProduct(product);
                          }}
                        >
                          {alreadySelected ? 'Adicionado' : 'Adicionar'}
                        </Button>
                      </li>
                    );
                  })
                )}
              </ul>
            ) : null}

            {selected.length > 0 ? (
              <ul className="flex flex-col divide-y rounded-(--radius-md) border">
                {selected.map((product) => (
                  <li
                    key={product.id}
                    className="flex items-center justify-between gap-2 px-3 py-2"
                  >
                    <span className="flex items-center gap-2 text-sm">
                      <span className="font-mono text-xs text-muted-foreground">{product.sku}</span>
                      {product.name}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        removeProduct(product.id);
                      }}
                      className="rounded-sm p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                      aria-label={`Remover ${product.name} da seleção`}
                    >
                      <X aria-hidden="true" className="size-4" />
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">
                Nenhum produto selecionado ainda. Busque acima para adicionar.
              </p>
            )}
          </CardContent>
        </Card>

        <Card className="max-w-xl border shadow-none">
          <CardContent className="flex flex-col gap-4 pt-6">
            <FormField label="Observação" error={errors.note?.message}>
              {(field) => <Input {...field} {...register('note')} />}
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
              <Button type="button" variant="outline" onClick={() => void navigate('/inventories')}>
                Cancelar
              </Button>
              <Button type="submit" disabled={openMutation.isPending || selected.length === 0}>
                {openMutation.isPending ? 'Abrindo…' : 'Abrir inventário'}
              </Button>
            </div>
          </CardContent>
        </Card>
      </form>
    </div>
  );
}
