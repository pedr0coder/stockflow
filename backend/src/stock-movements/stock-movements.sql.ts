import { Prisma } from '../generated/prisma/client';

/**
 * SQL cru do módulo de movimentações, concentrado neste arquivo
 * (docs/17-plano-fase-5.md, I10): a revisão de segurança tem um só lugar para
 * olhar, e todo parâmetro entra por template tagged do Prisma — nunca
 * concatenação de string (docs/08-seguranca.md §8.5).
 *
 * As três instruções implementam o ADR-0003 (UPDATE condicional atômico): a
 * verificação e a escrita de saldo acontecem na MESMA instrução SQL, dentro da
 * transação que também grava o movimento. Zero linhas de volta não diz por
 * quê — a classificação do motivo é feita por quem chama, com uma leitura
 * adicional na mesma transação (`readProductState`).
 */

export interface BalanceRow {
  stock_before: Prisma.Decimal;
  stock_after: Prisma.Decimal;
}

export interface ProductStateRow {
  is_active: boolean;
  current_stock: Prisma.Decimal;
}

/**
 * Entrada: soma a quantidade ao saldo.
 *
 * Exige produto ativo. Não exige saldo mínimo — uma entrada nunca é recusada
 * por falta de saldo.
 */
export function applyIncrease(
  tx: Prisma.TransactionClient,
  productId: string,
  quantity: string,
): Promise<BalanceRow[]> {
  return tx.$queryRaw<BalanceRow[]>`
    UPDATE products
       SET current_stock = current_stock + ${quantity}::numeric,
           updated_at    = now()
     WHERE id = ${productId}::uuid
       AND is_active = true
    RETURNING current_stock - ${quantity}::numeric AS stock_before,
              current_stock                         AS stock_after
  `;
}

/**
 * Saída: subtrai a quantidade do saldo, só se houver saldo suficiente.
 *
 * A guarda `current_stock >= quantity` vive DENTRO do UPDATE (ADR-0003): é o
 * que torna a decisão atômica sob concorrência. Duas saídas concorrentes do
 * mesmo produto são serializadas pelo lock de linha do Postgres, e a segunda
 * reavalia a condição já com o saldo que a primeira deixou.
 */
export function applyDecrease(
  tx: Prisma.TransactionClient,
  productId: string,
  quantity: string,
): Promise<BalanceRow[]> {
  return tx.$queryRaw<BalanceRow[]>`
    UPDATE products
       SET current_stock = current_stock - ${quantity}::numeric,
           updated_at    = now()
     WHERE id = ${productId}::uuid
       AND is_active = true
       AND current_stock >= ${quantity}::numeric
    RETURNING current_stock + ${quantity}::numeric AS stock_before,
              current_stock                         AS stock_after
  `;
}

/**
 * Ajuste manual: define o saldo para `finalQuantity` (valor absoluto, não
 * delta — ADR-0003, decisão acessória). Um ajuste que não mudaria o saldo é
 * recusado pelo próprio `WHERE` (zero linhas), para não gravar um movimento
 * sem efeito.
 *
 * O `RETURNING` de um `UPDATE` só devolve o valor NOVO da linha, então o
 * saldo anterior vem de uma CTE que também trava a linha com `FOR UPDATE` —
 * validado em PostgreSQL real no plano (docs/17-plano-fase-5.md §17.5.2).
 */
export function applyAdjustment(
  tx: Prisma.TransactionClient,
  productId: string,
  finalQuantity: string,
): Promise<BalanceRow[]> {
  return tx.$queryRaw<BalanceRow[]>`
    WITH prev AS (
      SELECT id, current_stock FROM products
       WHERE id = ${productId}::uuid AND is_active = true
       FOR UPDATE
    )
    UPDATE products p
       SET current_stock = ${finalQuantity}::numeric,
           updated_at    = now()
      FROM prev
     WHERE p.id = prev.id
       AND prev.current_stock <> ${finalQuantity}::numeric
    RETURNING prev.current_stock AS stock_before, p.current_stock AS stock_after
  `;
}

/**
 * Estado atual do produto, lido DENTRO da mesma transação depois de um UPDATE
 * condicional ter devolvido zero linhas — para classificar o motivo
 * (inexistente, inativo, sem saldo) sem uma segunda decisão fora da
 * atomicidade (docs/17-plano-fase-5.md §17.5.3).
 */
export async function readProductState(
  tx: Prisma.TransactionClient,
  productId: string,
): Promise<ProductStateRow | undefined> {
  const rows = await tx.$queryRaw<ProductStateRow[]>`
    SELECT is_active, current_stock FROM products WHERE id = ${productId}::uuid
  `;

  return rows[0];
}
