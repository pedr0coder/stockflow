import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/**
 * SQL cru do dashboard (docs/17-plano-fase-5.md §17.4.4, marco 5B): agregação
 * em SQL, zero quando não há dado — nunca calculado em JavaScript sobre a
 * listagem completa.
 */

export interface SummaryRow {
  active_products: number;
  low_stock: number;
  out_of_stock: number;
  movements_last_30_days: number;
}

export function readSummary(prisma: PrismaService): Promise<SummaryRow[]> {
  return prisma.$queryRaw<SummaryRow[]>`
    SELECT
      (SELECT count(*)::int FROM products WHERE is_active) AS active_products,
      (SELECT count(*)::int FROM products WHERE is_active AND current_stock > 0 AND current_stock <= min_stock) AS low_stock,
      (SELECT count(*)::int FROM products WHERE is_active AND current_stock = 0) AS out_of_stock,
      (SELECT count(*)::int FROM stock_movements WHERE created_at >= now() - interval '30 days') AS movements_last_30_days
  `;
}

export interface MovementsChartRow {
  day: Date;
  type: string;
  total: number;
}

/** Série diária por tipo, nos últimos `days` dias (UTC). Dia sem movimento simplesmente não aparece aqui. */
export function readMovementsChart(
  prisma: PrismaService,
  days: number,
): Promise<MovementsChartRow[]> {
  return prisma.$queryRaw<MovementsChartRow[]>`
    SELECT date_trunc('day', created_at)::date AS day, type::text, count(*)::int AS total
      FROM stock_movements
     WHERE created_at >= now() - (${days}::text || ' days')::interval
     GROUP BY day, type
     ORDER BY day ASC, type ASC
  `;
}

export interface RecentMovementRow {
  id: string;
  product_id: string;
  product_name: string;
  type: string;
  reason: string;
  quantity: Prisma.Decimal;
  stock_after: Prisma.Decimal;
  user_name: string;
  created_at: Date;
}

export function readRecentMovements(
  prisma: PrismaService,
  limit: number,
): Promise<RecentMovementRow[]> {
  return prisma.$queryRaw<RecentMovementRow[]>`
    SELECT sm.id::text, sm.product_id::text, p.name AS product_name, sm.type::text, sm.reason::text,
           sm.quantity, sm.stock_after, u.name AS user_name, sm.created_at
      FROM stock_movements sm
      JOIN products p ON p.id = sm.product_id
      JOIN users u ON u.id = sm.user_id
     ORDER BY sm.created_at DESC, sm.id DESC
     LIMIT ${limit}
  `;
}
