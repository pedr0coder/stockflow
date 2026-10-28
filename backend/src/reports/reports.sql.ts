import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/** SQL cru dos relatórios (docs/17-plano-fase-5.md §17.4.4, marco 5B). */

export interface LowStockRow {
  id: string;
  sku: string;
  name: string;
  current_stock: Prisma.Decimal;
  min_stock: Prisma.Decimal;
  deficit: Prisma.Decimal;
}

export function readLowStock(prisma: PrismaService): Promise<LowStockRow[]> {
  return prisma.$queryRaw<LowStockRow[]>`
    SELECT id::text, sku, name, current_stock, min_stock, (min_stock - current_stock) AS deficit
      FROM products
     WHERE is_active AND current_stock > 0 AND current_stock <= min_stock
     ORDER BY deficit DESC, name ASC
  `;
}

export interface OutOfStockRow {
  id: string;
  sku: string;
  name: string;
}

export function readOutOfStock(prisma: PrismaService): Promise<OutOfStockRow[]> {
  return prisma.$queryRaw<OutOfStockRow[]>`
    SELECT id::text, sku, name FROM products WHERE is_active AND current_stock = 0 ORDER BY name ASC
  `;
}

export interface MovementsReportRow {
  type: string;
  reason: string;
  movements_count: number;
  total_quantity: Prisma.Decimal;
}

export function readMovementsReport(
  prisma: PrismaService,
  from: Date | undefined,
  to: Date | undefined,
): Promise<MovementsReportRow[]> {
  return prisma.$queryRaw<MovementsReportRow[]>`
    SELECT type::text, reason::text, count(*)::int AS movements_count, sum(quantity) AS total_quantity
      FROM stock_movements
     WHERE (${from ?? null}::timestamptz IS NULL OR created_at >= ${from ?? null}::timestamptz)
       AND (${to ?? null}::timestamptz IS NULL OR created_at < ${to ?? null}::timestamptz)
     GROUP BY type, reason
     ORDER BY type ASC, reason ASC
  `;
}

export interface InventoryReportRow {
  id: string;
  code: string;
  status: string;
  started_at: Date;
  closed_at: Date | null;
  items_count: number;
  counted_count: number;
  adjusted_count: number;
}

export function readInventoriesReport(prisma: PrismaService): Promise<InventoryReportRow[]> {
  return prisma.$queryRaw<InventoryReportRow[]>`
    SELECT i.id::text, i.code, i.status::text, i.started_at, i.closed_at,
           count(ii.id)::int AS items_count,
           count(ii.counted_qty)::int AS counted_count,
           count(sm.id)::int AS adjusted_count
      FROM inventories i
 LEFT JOIN inventory_items ii ON ii.inventory_id = i.id
 LEFT JOIN stock_movements sm ON sm.inventory_item_id = ii.id
     GROUP BY i.id, i.code, i.status, i.started_at, i.closed_at
     ORDER BY i.started_at DESC
  `;
}

export interface DivergenceRow {
  inventory_id: string;
  inventory_code: string;
  item_id: string;
  product_id: string;
  product_name: string;
  expected_qty: Prisma.Decimal;
  counted_qty: Prisma.Decimal;
  moved_since_count: Prisma.Decimal;
}

/** Itens divergentes de inventários JÁ APROVADOS (docs/17 §17.6.7). */
export function readDivergences(prisma: PrismaService): Promise<DivergenceRow[]> {
  return prisma.$queryRaw<DivergenceRow[]>`
    SELECT i.id::text AS inventory_id, i.code AS inventory_code, ii.id::text AS item_id,
           ii.product_id::text, p.name AS product_name, ii.expected_qty, ii.counted_qty,
           (p.current_stock - ii.expected_qty) AS moved_since_count
      FROM inventory_items ii
      JOIN inventories i ON i.id = ii.inventory_id
      JOIN products p ON p.id = ii.product_id
     WHERE i.status = 'APPROVED'
       AND ii.counted_qty IS NOT NULL
       AND ii.counted_qty <> ii.expected_qty
     ORDER BY i.started_at DESC, ii.product_id ASC
  `;
}

export interface ReconciliationRow {
  id: string;
  sku: string;
  name: string;
  current_stock: Prisma.Decimal;
  derived_stock: Prisma.Decimal;
  difference: Prisma.Decimal;
}

/**
 * Saldo gravado contra saldo derivado do histórico, por produto
 * (docs/17 §17.4.4). `derived_stock` soma `(stock_after - stock_before)` de
 * todo movimento do produto: em um histórico consistente, bate com
 * `current_stock`. Produto sem nenhum movimento não entra (mesmo raciocínio
 * de CI1b, §17.7.6): nada reivindica o saldo que ele tem.
 */
export function readReconciliation(prisma: PrismaService): Promise<ReconciliationRow[]> {
  return prisma.$queryRaw<ReconciliationRow[]>`
    WITH derivado AS (
      SELECT product_id, sum(stock_after - stock_before) AS derived_stock
        FROM stock_movements
       GROUP BY product_id
    )
    SELECT p.id::text, p.sku, p.name, p.current_stock, d.derived_stock,
           (p.current_stock - d.derived_stock) AS difference
      FROM products p
      JOIN derivado d ON d.product_id = p.id
     WHERE p.current_stock <> d.derived_stock
     ORDER BY p.name ASC
  `;
}
