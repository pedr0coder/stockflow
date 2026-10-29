import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { useProductQuery } from '@/features/products/queries';

/**
 * `InventoryItemDto` não embute nome/SKU do produto — só `productId`
 * (backend/src/inventories/dto/inventory.dto.ts). Resolvido aqui por item,
 * em vez de buscar todo o catálogo de antemão: o React Query cacheia cada
 * produto uma vez só, mesmo que apareça em mais de um inventário.
 */
export function InventoryProductCell({ productId }: { productId: string }): ReactNode {
  const { data: product, isPending } = useProductQuery(productId);

  if (isPending) {
    return <span className="text-xs text-muted-foreground">Carregando…</span>;
  }

  if (product === undefined) {
    return <span className="font-mono text-xs text-muted-foreground">{productId}</span>;
  }

  return (
    <Link to={`/products/${productId}`} className="flex flex-col hover:underline">
      <span className="text-sm">{product.name}</span>
      <span className="font-mono text-xs text-muted-foreground">{product.sku}</span>
    </Link>
  );
}
