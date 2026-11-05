import { Prisma } from '../generated/prisma/client';

/**
 * SQL cru do módulo de inventário, concentrado neste arquivo pelo mesmo
 * motivo do `stock-movements.sql.ts` (docs/17-plano-fase-5.md, I10): a
 * revisão de segurança tem um só lugar para olhar, e todo parâmetro entra por
 * template tagged do Prisma, nunca concatenação de string.
 *
 * Cada transição de estado é um `UPDATE` condicionado ao estado de origem na
 * cláusula `WHERE` (o mesmo raciocínio do ADR-0003, aplicado ao estado em vez
 * do saldo): zero linhas de volta não diz por quê, e quem chama faz uma
 * leitura adicional na mesma transação para classificar o motivo.
 */

export interface InventoryStateRow {
  status: string;
}

/**
 * Próximo código do ano corrente (`INV-AAAA-NNNN`).
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ Sem advisory lock nenhum, de propósito (revisão pós-5A): a primeira       │
 * │ implementação usava `pg_advisory_xact_lock` cobrindo a transação de       │
 * │ abertura INTEIRA, o que serializava TODAS as aberturas entre si — mesmo   │
 * │ duas sem produto em comum, que o plano (docs/17 §17.6.2) nunca pediu      │
 * │ para bloquear. O lock existia só para a geração do código, "não faz      │
 * │ parte da garantia" (texto do próprio plano), e cobrir a transação toda    │
 * │ confundia as duas coisas.                                                │
 * │                                                                          │
 * │ Aqui não há lock: o `service.open()` lê este `MAX+1` sem travar nada, e  │
 * │ a unicidade real vem do índice único de `inventories.code` no banco      │
 * │ (`inventories_code_key`, já existente desde a Fase 2). Se duas aberturas │
 * │ concorrentes calcularem o MESMO próximo número — só ocorre quando as duas│
 * │ competem pelo próximo código do mesmo ano, uma janela estreita —, a      │
 * │ segunda `INSERT` falha com violação de unicidade (`23505`), e o service  │
 * │ relança a transação inteira com um código recalculado (função            │
 * │ `isCodeConflict`, retry limitado). Duas aberturas de produtos DIFERENTES  │
 * │ deixam de esperar uma pela outra sem motivo — e a exclusividade de        │
 * │ produto (D17) continua garantida só pelo índice único PARCIAL de         │
 * │ `inventory_items`, nunca por este código.                                │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export async function nextInventoryCode(tx: Prisma.TransactionClient): Promise<string> {
  const year = new Date().getUTCFullYear();
  const prefix = `INV-${String(year)}-`;

  const rows = await tx.$queryRaw<{ next: number }[]>`
    SELECT COALESCE(MAX(substring(code from 10 for 4)::int), 0) + 1 AS next
      FROM inventories
     WHERE code LIKE ${`${prefix}%`}
  `;

  const next = rows[0]?.next ?? 1;

  return `${prefix}${String(next).padStart(4, '0')}`;
}

export function insertInventory(
  tx: Prisma.TransactionClient,
  id: string,
  code: string,
  userId: string,
  note: string | undefined,
): Promise<void> {
  return tx.$executeRaw`
    INSERT INTO inventories (id, code, status, note, created_by_id, updated_at)
    VALUES (${id}::uuid, ${code}, 'OPEN', ${note ?? null}, ${userId}::uuid, now())
  `.then(() => undefined);
}

/**
 * Insere os itens do inventário, um por produto selecionado.
 *
 * `ON CONFLICT (product_id) WHERE in_progress DO NOTHING` usa o índice único
 * parcial da D17: um produto já retido por outro inventário não finalizado
 * simplesmente não entra, sem erro — quem chama decide o que fazer com a
 * diferença entre pedidos e inseridos. `ORDER BY product_id` evita que duas
 * aberturas concorrentes com produtos parcialmente sobrepostos travem em
 * ciclo (docs/17 §17.6.2); com a trava de abertura (acima) isso já não pode
 * ocorrer entre duas chamadas deste service, mas o `ORDER BY` continua
 * correto por si e é o que o plano descreve.
 */
export async function insertInventoryItems(
  tx: Prisma.TransactionClient,
  inventoryId: string,
  itemIds: string[],
  productIds: string[],
): Promise<string[]> {
  const rows = await tx.$queryRaw<{ product_id: string }[]>`
    INSERT INTO inventory_items (id, inventory_id, product_id, updated_at)
    SELECT t.id, ${inventoryId}::uuid, t.product_id, now()
      FROM unnest(${itemIds}::uuid[], ${productIds}::uuid[]) AS t(id, product_id)
     ORDER BY t.product_id
        ON CONFLICT (product_id) WHERE in_progress DO NOTHING
    RETURNING product_id::text
  `;

  return rows.map((row) => row.product_id);
}

export function readExistingProductIds(
  tx: Prisma.TransactionClient,
  productIds: string[],
): Promise<{ id: string; is_active: boolean }[]> {
  return tx.$queryRaw<{ id: string; is_active: boolean }[]>`
    SELECT id::text, is_active FROM products WHERE id = ANY(${productIds}::uuid[])
  `;
}

export interface RetainingRow {
  product_id: string;
  inventory_id: string;
}

/** Quem retém cada produto hoje, para o `details` de `PRODUCT_IN_OPEN_INVENTORY`. */
export function readRetainingInventories(
  tx: Prisma.TransactionClient,
  productIds: string[],
): Promise<RetainingRow[]> {
  return tx.$queryRaw<RetainingRow[]>`
    SELECT product_id::text, inventory_id::text
      FROM inventory_items
     WHERE product_id = ANY(${productIds}::uuid[]) AND in_progress
  `;
}

export async function readInventoryState(
  tx: Prisma.TransactionClient,
  inventoryId: string,
): Promise<InventoryStateRow | undefined> {
  const rows = await tx.$queryRaw<InventoryStateRow[]>`
    SELECT status::text FROM inventories WHERE id = ${inventoryId}::uuid
  `;

  return rows[0];
}

export interface CountResultRow {
  id: string;
  product_id: string;
  expected_qty: Prisma.Decimal;
  counted_qty: Prisma.Decimal;
  counted_at: Date;
  old_counted_qty: Prisma.Decimal | null;
}

/**
 * Registra a contagem: `expectedQty` é congelado com o `current_stock` do
 * produto NO MESMO INSTANTE, lido pela mesma instrução que grava a contagem
 * (docs/17 §17.6.3) — nunca de uma leitura separada antes. Recontagem
 * sobrescreve e re-congela (S7, S8): a última vence.
 *
 * A condição `i.status IN ('OPEN','COUNTING')` exige que o inventário ainda
 * aceite contagem; zero linhas não diz se foi por isso ou porque o item não
 * existe (ou é de outro inventário) — quem chama classifica com uma leitura
 * adicional.
 */
export async function recordCount(
  tx: Prisma.TransactionClient,
  inventoryId: string,
  itemId: string,
  userId: string,
  countedQty: string,
): Promise<CountResultRow[]> {
  await tx.$executeRaw`
    UPDATE inventories SET status = 'COUNTING', updated_at = now()
     WHERE id = ${inventoryId}::uuid AND status = 'OPEN'
  `;

  return tx.$queryRaw<CountResultRow[]>`
    WITH prev AS (
      SELECT counted_qty AS old_counted_qty FROM inventory_items WHERE id = ${itemId}::uuid
    )
    UPDATE inventory_items ii
       SET counted_qty = ${countedQty}::numeric,
           expected_qty = p.current_stock,
           counted_at = now(),
           counted_by_id = ${userId}::uuid,
           updated_at = now()
      FROM products p, inventories i, prev
     WHERE ii.id = ${itemId}::uuid
       AND ii.inventory_id = ${inventoryId}::uuid
       AND p.id = ii.product_id
       AND i.id = ii.inventory_id
       AND i.status IN ('OPEN', 'COUNTING')
    RETURNING ii.id::text, ii.product_id::text, ii.expected_qty AS expected_qty,
              ii.counted_qty AS counted_qty, ii.counted_at AS counted_at,
              prev.old_counted_qty AS old_counted_qty
  `;
}

export function readItemState(
  tx: Prisma.TransactionClient,
  inventoryId: string,
  itemId: string,
): Promise<{ exists: boolean }[]> {
  return tx.$queryRaw<{ exists: boolean }[]>`
    SELECT true AS exists FROM inventory_items WHERE id = ${itemId}::uuid AND inventory_id = ${inventoryId}::uuid
  `;
}

/** D6: enviar ou aprovar exige ao menos um item contado. */
export function submitInventory(
  tx: Prisma.TransactionClient,
  inventoryId: string,
): Promise<{ id: string }[]> {
  return tx.$queryRaw<{ id: string }[]>`
    UPDATE inventories
       SET status = 'PENDING_APPROVAL', updated_at = now()
     WHERE id = ${inventoryId}::uuid
       AND status IN ('OPEN', 'COUNTING')
       AND EXISTS (
         SELECT 1 FROM inventory_items
          WHERE inventory_id = ${inventoryId}::uuid AND counted_qty IS NOT NULL
       )
    RETURNING id::text
  `;
}

export function hasCountedItems(
  tx: Prisma.TransactionClient,
  inventoryId: string,
): Promise<{ any: boolean }[]> {
  return tx.$queryRaw<{ any: boolean }[]>`
    SELECT EXISTS (
      SELECT 1 FROM inventory_items WHERE inventory_id = ${inventoryId}::uuid AND counted_qty IS NOT NULL
    ) AS any
  `;
}

export function cancelInventory(
  tx: Prisma.TransactionClient,
  inventoryId: string,
): Promise<{ id: string }[]> {
  return tx.$queryRaw<{ id: string }[]>`
    UPDATE inventories
       SET status = 'CANCELLED', closed_at = now(), updated_at = now()
     WHERE id = ${inventoryId}::uuid
       AND status IN ('OPEN', 'COUNTING', 'PENDING_APPROVAL')
    RETURNING id::text
  `;
}

/** G1: a trava central da aprovação. Zero linhas não diz por quê. */
export function lockInventoryForApproval(
  tx: Prisma.TransactionClient,
  inventoryId: string,
  userId: string,
): Promise<{ id: string }[]> {
  return tx.$queryRaw<{ id: string }[]>`
    UPDATE inventories
       SET status = 'APPROVED', approved_by_id = ${userId}::uuid, approved_at = now(),
           closed_at = now(), updated_at = now()
     WHERE id = ${inventoryId}::uuid AND status = 'PENDING_APPROVAL'
    RETURNING id::text
  `;
}

export interface DivergentItemRow {
  id: string;
  product_id: string;
  expected_qty: Prisma.Decimal;
  counted_qty: Prisma.Decimal;
}

/** Itens contados com divergência, ORDENADOS por produto (evita ciclo de espera, §17.6.3). */
export function readDivergentItems(
  tx: Prisma.TransactionClient,
  inventoryId: string,
): Promise<DivergentItemRow[]> {
  return tx.$queryRaw<DivergentItemRow[]>`
    SELECT id::text, product_id::text, expected_qty, counted_qty
      FROM inventory_items
     WHERE inventory_id = ${inventoryId}::uuid
       AND counted_qty IS NOT NULL
       AND counted_qty <> expected_qty
     ORDER BY product_id ASC
  `;
}

export interface ApplyDeltaRow {
  stock_before: Prisma.Decimal;
  stock_after: Prisma.Decimal;
}

/**
 * Aplica o delta da divergência ao saldo do produto.
 *
 * Sem exigir `is_active` (D9, §17.6.6): a aprovação de inventário é a ÚNICA
 * operação de estoque que ajusta produto inativo, restrita a A/M porque só
 * eles abrem e aprovam inventário. `delta` é uma string de `Prisma.Decimal`
 * já calculada por quem chama (nunca aritmética de `number`).
 */
export function applyInventoryDelta(
  tx: Prisma.TransactionClient,
  productId: string,
  delta: string,
): Promise<ApplyDeltaRow[]> {
  return tx.$queryRaw<ApplyDeltaRow[]>`
    UPDATE products
       SET current_stock = current_stock + ${delta}::numeric,
           updated_at = now()
     WHERE id = ${productId}::uuid
       AND current_stock + ${delta}::numeric >= 0
    RETURNING current_stock - ${delta}::numeric AS stock_before,
              current_stock                     AS stock_after
  `;
}

/** Saldo atual de vários produtos de uma vez, para listar TODOS os problemas de uma aprovação. */
export function readProductStocks(
  tx: Prisma.TransactionClient,
  productIds: string[],
): Promise<{ id: string; current_stock: Prisma.Decimal }[]> {
  return tx.$queryRaw<{ id: string; current_stock: Prisma.Decimal }[]>`
    SELECT id::text, current_stock FROM products WHERE id = ANY(${productIds}::uuid[])
  `;
}

export async function readProductCurrentStock(
  tx: Prisma.TransactionClient,
  productId: string,
): Promise<Prisma.Decimal | undefined> {
  const rows = await tx.$queryRaw<{ current_stock: Prisma.Decimal }[]>`
    SELECT current_stock FROM products WHERE id = ${productId}::uuid
  `;

  return rows[0]?.current_stock;
}

export interface ItemDetailRow {
  id: string;
  product_id: string;
  product_sku: string;
  product_name: string;
  expected_qty: Prisma.Decimal | null;
  counted_qty: Prisma.Decimal | null;
  counted_at: Date | null;
  counted_by_id: string | null;
  counted_by_name: string | null;
  current_stock: Prisma.Decimal;
  movements_since_count: number;
}

/**
 * Detalhe dos itens, com `current_stock` ao vivo e a contagem de movimentos
 * do produto depois da contagem — os campos que deixam o `movedSinceCount`
 * (D18, §17.6.7) visível ANTES da aprovação.
 *
 * `product_sku` e `product_name` vêm do `JOIN products` que já existia por
 * causa do `current_stock` (Marco 7C, M7C-2): sem eles, a tela de detalhe
 * buscava cada produto por `GET /products/:id`, até 50 requisições por
 * inventário aberto.
 */
export function readItemsDetail(
  tx: Prisma.TransactionClient,
  inventoryId: string,
): Promise<ItemDetailRow[]> {
  return tx.$queryRaw<ItemDetailRow[]>`
    SELECT ii.id::text, ii.product_id::text, p.sku AS product_sku, p.name AS product_name,
           ii.expected_qty, ii.counted_qty,
           ii.counted_at, ii.counted_by_id::text, u.name AS counted_by_name,
           p.current_stock,
           (
             SELECT count(*)::int FROM stock_movements sm
              WHERE sm.product_id = ii.product_id
                AND ii.counted_at IS NOT NULL
                AND sm.created_at > ii.counted_at
           ) AS movements_since_count
      FROM inventory_items ii
      JOIN products p ON p.id = ii.product_id
 LEFT JOIN users u ON u.id = ii.counted_by_id
     WHERE ii.inventory_id = ${inventoryId}::uuid
     ORDER BY ii.product_id ASC
  `;
}
