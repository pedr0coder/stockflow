import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { useProductQuery } from '@/features/products/queries';

interface InventoryProductCellProps {
  productId: string;
  /** SKU e nome vindos do próprio item (`GET /inventories/:id`, Marco 7C M7C-2). */
  productSku?: string | undefined;
  productName?: string | undefined;
}

function ProductLink({
  productId,
  sku,
  name,
}: {
  productId: string;
  sku: string;
  name: string;
}): ReactNode {
  return (
    <Link to={`/products/${productId}`} className="flex flex-col hover:underline">
      <span className="text-sm">{name}</span>
      <span className="font-mono text-xs text-muted-foreground">{sku}</span>
    </Link>
  );
}

/**
 * Fallback para um item sem nome/SKU: busca o produto por id.
 *
 * Fica num componente à parte porque `useProductQuery` é um hook e não pode ser
 * chamado condicionalmente — o ramo principal não deve nem montar a query, que
 * é exatamente o que gerava até 50 requisições `GET /products/:id` por tela.
 */
function LookupProductCell({ productId }: { productId: string }): ReactNode {
  const { data: product, isPending } = useProductQuery(productId);

  if (isPending) {
    return <span className="text-xs text-muted-foreground">Carregando…</span>;
  }

  if (product === undefined) {
    return <span className="font-mono text-xs text-muted-foreground">{productId}</span>;
  }

  return <ProductLink productId={productId} sku={product.sku} name={product.name} />;
}

/**
 * `GET /inventories/:id` embute `productSku` e `productName` em cada item (o
 * `JOIN products` já existia no backend por causa do saldo), então o caminho
 * normal não faz nenhuma requisição extra.
 *
 * A busca por produto sobrevive só como rede de segurança para respostas que
 * não trazem os dois campos (ex.: um backend anterior à M7C-2 durante um
 * deploy escalonado). O React Query cacheia cada produto uma vez só.
 */
export function InventoryProductCell({
  productId,
  productSku,
  productName,
}: InventoryProductCellProps): ReactNode {
  if (productSku !== undefined && productName !== undefined) {
    return <ProductLink productId={productId} sku={productSku} name={productName} />;
  }

  return <LookupProductCell productId={productId} />;
}
