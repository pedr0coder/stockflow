import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
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
  /**
   * Índice realçado pelo teclado, dentro da página atual de resultados.
   *
   * `-1` é "nenhum realçado" — estado inicial e o que a lista volta a cada
   * busca nova, para não apontar para um item que não existe mais na página
   * seguinte de resultados.
   */
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const debouncedSearch = useDebouncedValue(search, 300);
  const listboxId = useId();
  const containerRef = useRef<HTMLDivElement>(null);

  const query = useProductsQuery({
    page: 1,
    limit: 10,
    isActive: true,
    ...(debouncedSearch.length > 0 ? { search: debouncedSearch } : {}),
  });

  const options = query.data?.data ?? [];

  function selectProduct(product: Product): void {
    onChange(product);
    setSearch('');
    setIsOpen(false);
    setHighlightedIndex(-1);
  }

  function optionId(index: number): string {
    return `${listboxId}-option-${String(index)}`;
  }

  /**
   * Navegação por teclado do combobox.
   *
   * Sem isto, a lista só é operável com mouse — `aria-selected` nas opções
   * não tinha o que refletir, porque nunca havia um item realçado por
   * teclado (Marco 7A, A4). `preventDefault` em Enter evita que o
   * formulário em volta seja submetido quando a intenção é escolher o item
   * realçado, não enviar o form.
   */
  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    if (!isOpen || options.length === 0) {
      return;
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setHighlightedIndex((current) => Math.min(current + 1, options.length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setHighlightedIndex((current) => Math.max(current - 1, 0));
    } else if (event.key === 'Enter') {
      if (highlightedIndex >= 0 && highlightedIndex < options.length) {
        event.preventDefault();
        const selected = options[highlightedIndex];
        if (selected) {
          selectProduct(selected);
        }
      }
    } else if (event.key === 'Escape') {
      setIsOpen(false);
      setHighlightedIndex(-1);
    }
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
          setHighlightedIndex(-1);
        }}
        onFocus={() => {
          setIsOpen(true);
        }}
        onBlur={() => {
          // Sem `setTimeout`: o clique num item já não dispara blur, porque
          // cada botão da lista chama `preventDefault` no `onMouseDown` (ver
          // abaixo). O que resta fechar aqui é perder o foco de verdade —
          // Tab para fora, ou clique fora do combobox.
          setIsOpen(false);
          setHighlightedIndex(-1);
        }}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        placeholder="Buscar por SKU ou nome…"
        role="combobox"
        aria-expanded={isOpen}
        aria-controls={listboxId}
        aria-autocomplete="list"
        {...(highlightedIndex >= 0 ? { 'aria-activedescendant': optionId(highlightedIndex) } : {})}
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
          ) : options.length === 0 ? (
            <li className="px-2 py-1.5 text-sm text-muted-foreground">
              Nenhum produto ativo encontrado.
            </li>
          ) : (
            options.map((product, index) => (
              <li
                key={product.id}
                id={optionId(index)}
                role="option"
                aria-selected={index === highlightedIndex}
              >
                <button
                  type="button"
                  onMouseDown={(event) => {
                    // Impede o blur do input antes do `onClick` abaixo rodar
                    // — é isto, e não um temporizador, que garante que o
                    // clique na opção chegue a registrar.
                    event.preventDefault();
                  }}
                  onClick={() => {
                    selectProduct(product);
                  }}
                  className={cn(
                    'flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent hover:text-accent-foreground',
                    index === highlightedIndex && 'bg-accent text-accent-foreground',
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
