import { useId, useRef, useState, type ReactNode } from 'react';
import { Input } from '@/components/ui/input';
import { useProductsQuery } from '@/features/products/queries';
import type { Product } from '@/features/products/api';
import { cn } from '@/lib/utils';
import { useDebouncedValue } from '@/lib/use-debounced-value';

export interface ProductPickerProps {
  value: Product | null;
  onChange: (product: Product | null) => void;
  id?: string;
  'aria-describedby'?: string | undefined;
  'aria-invalid'?: boolean;
  disabled?: boolean;
}

/**
 * Busca de produto por SKU ou nome, com seleção única.
 *
 * Não existe um seletor de todos os produtos de uma vez (ao contrário de
 * categoria/fornecedor em `ProductForm`): o catálogo pode ter centenas de
 * itens, então a busca é incremental contra `GET /products?search=`, com
 * atraso (debounce), em vez de carregar tudo e filtrar no cliente.
 */
export function ProductPicker({
  value,
  onChange,
  id,
  disabled = false,
  ...aria
}: ProductPickerProps): ReactNode {
  const [search, setSearch] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const debouncedSearch = useDebouncedValue(search, 300);
  const listboxId = useId();
  const containerRef = useRef<HTMLDivElement>(null);

  const query = useProductsQuery({
    page: 1,
    limit: 10,
    isActive: true,
    ...(debouncedSearch.length > 0 ? { search: debouncedSearch } : {}),
  });

  function selectProduct(product: Product): void {
    onChange(product);
    setSearch('');
    setIsOpen(false);
  }

  if (value !== null) {
    return (
      <div className="flex items-center gap-2">
        <div className="flex h-9 flex-1 items-center gap-2 rounded-md border border-input bg-transparent px-3 text-sm">
          <span className="font-mono text-xs text-muted-foreground">{value.sku}</span>
          <span className="truncate">{value.name}</span>
        </div>
        <button
          type="button"
          onClick={() => {
            onChange(null);
          }}
          disabled={disabled}
          className="shrink-0 text-xs text-muted-foreground underline hover:text-foreground"
        >
          Trocar
        </button>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative">
      <Input
        id={id}
        value={search}
        onChange={(event) => {
          setSearch(event.target.value);
          setIsOpen(true);
        }}
        onFocus={() => {
          setIsOpen(true);
        }}
        onBlur={() => {
          // Atraso para o clique num item da lista registrar antes do blur
          // fechar a lista — sem isto, `onClick` nunca dispara.
          setTimeout(() => {
            setIsOpen(false);
          }, 150);
        }}
        disabled={disabled}
        placeholder="Buscar por SKU ou nome…"
        role="combobox"
        aria-expanded={isOpen}
        aria-controls={listboxId}
        aria-autocomplete="list"
        {...aria}
      />

      {isOpen ? (
        <ul
          id={listboxId}
          role="listbox"
          className="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
        >
          {query.isPending ? (
            <li className="px-2 py-1.5 text-sm text-muted-foreground">Buscando…</li>
          ) : query.data?.data.length === 0 ? (
            <li className="px-2 py-1.5 text-sm text-muted-foreground">
              Nenhum produto ativo encontrado.
            </li>
          ) : (
            query.data?.data.map((product) => (
              <li key={product.id} role="option" aria-selected={false}>
                <button
                  type="button"
                  onClick={() => {
                    selectProduct(product);
                  }}
                  className={cn(
                    'flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent hover:text-accent-foreground',
                  )}
                >
                  <span className="font-mono text-xs text-muted-foreground">{product.sku}</span>
                  <span className="truncate">{product.name}</span>
                </button>
              </li>
            ))
          )}
        </ul>
      ) : null}
    </div>
  );
}
