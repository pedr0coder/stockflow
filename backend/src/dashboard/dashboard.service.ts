import { Injectable } from '@nestjs/common';
import { formatDecimalField } from '../common/utils/decimal-scale';
import { PrismaService } from '../prisma/prisma.service';
import { readMovementsChart, readRecentMovements, readSummary } from './dashboard.sql';
import type {
  DashboardSummaryDto,
  MovementsChartPointDto,
  RecentMovementDto,
} from './dto/summary.dto';

/** Agregações do dashboard, todas em SQL (docs/17-plano-fase-5.md §17.4.4). */
@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async summary(): Promise<DashboardSummaryDto> {
    const [row] = await readSummary(this.prisma);

    return {
      activeProducts: row?.active_products ?? 0,
      lowStock: row?.low_stock ?? 0,
      outOfStock: row?.out_of_stock ?? 0,
      movementsLast30Days: row?.movements_last_30_days ?? 0,
    };
  }

  async movementsChart(days: number): Promise<MovementsChartPointDto[]> {
    const rows = await readMovementsChart(this.prisma, days);

    return rows.map((row) => ({
      day: row.day.toISOString().slice(0, 10),
      type: row.type,
      total: row.total,
    }));
  }

  async recentMovements(limit: number): Promise<RecentMovementDto[]> {
    const rows = await readRecentMovements(this.prisma, limit);

    return rows.map((row) => ({
      id: row.id,
      productId: row.product_id,
      productName: row.product_name,
      type: row.type,
      reason: row.reason,
      quantity: formatDecimalField(row.quantity, 'quantity'),
      stockAfter: formatDecimalField(row.stock_after, 'stockAfter'),
      userName: row.user_name,
      createdAt: row.created_at,
    }));
  }
}
