import { Injectable } from '@nestjs/common';
import { formatDecimalField } from '../common/utils/decimal-scale';
import { PrismaService } from '../prisma/prisma.service';
import { MovementsReportQueryDto } from './dto/movements-report-query.dto';
import type {
  DivergenceRowDto,
  InventoryReportRowDto,
  LowStockItemDto,
  MovementsReportRowDto,
  OutOfStockItemDto,
  ReconciliationRowDto,
} from './dto/report.dto';
import {
  readDivergences,
  readInventoriesReport,
  readLowStock,
  readMovementsReport,
  readOutOfStock,
  readReconciliation,
} from './reports.sql';

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async lowStock(): Promise<LowStockItemDto[]> {
    const rows = await readLowStock(this.prisma);

    return rows.map((row) => ({
      id: row.id,
      sku: row.sku,
      name: row.name,
      currentStock: formatDecimalField(row.current_stock, 'currentStock'),
      minStock: formatDecimalField(row.min_stock, 'minStock'),
      deficit: formatDecimalField(row.deficit, 'minStock'),
    }));
  }

  async outOfStock(): Promise<OutOfStockItemDto[]> {
    const rows = await readOutOfStock(this.prisma);

    return rows.map((row) => ({ id: row.id, sku: row.sku, name: row.name }));
  }

  async movements(query: MovementsReportQueryDto): Promise<MovementsReportRowDto[]> {
    const from = query.dateFrom !== undefined ? new Date(query.dateFrom) : undefined;
    const to = query.dateTo !== undefined ? exclusiveEnd(query.dateTo) : undefined;
    const rows = await readMovementsReport(this.prisma, from, to);

    return rows.map((row) => ({
      type: row.type,
      reason: row.reason,
      movementsCount: row.movements_count,
      totalQuantity: formatDecimalField(row.total_quantity, 'quantity'),
    }));
  }

  async inventories(): Promise<InventoryReportRowDto[]> {
    const rows = await readInventoriesReport(this.prisma);

    return rows.map((row) => ({
      id: row.id,
      code: row.code,
      status: row.status,
      startedAt: row.started_at,
      closedAt: row.closed_at,
      itemsCount: row.items_count,
      countedCount: row.counted_count,
      adjustedCount: row.adjusted_count,
    }));
  }

  async divergences(): Promise<DivergenceRowDto[]> {
    const rows = await readDivergences(this.prisma);

    return rows.map((row) => ({
      inventoryId: row.inventory_id,
      inventoryCode: row.inventory_code,
      itemId: row.item_id,
      productId: row.product_id,
      productName: row.product_name,
      expectedQty: formatDecimalField(row.expected_qty, 'expectedQty'),
      countedQty: formatDecimalField(row.counted_qty, 'countedQty'),
      movedSinceCount: formatDecimalField(row.moved_since_count, 'quantity'),
    }));
  }

  async stockReconciliation(): Promise<ReconciliationRowDto[]> {
    const rows = await readReconciliation(this.prisma);

    return rows.map((row) => ({
      id: row.id,
      sku: row.sku,
      name: row.name,
      currentStock: formatDecimalField(row.current_stock, 'currentStock'),
      derivedStock: formatDecimalField(row.derived_stock, 'currentStock'),
      difference: formatDecimalField(row.difference, 'quantity'),
    }));
  }
}

/** Como D16 (Fase 5A): sem horário, `dateTo` vale até o fim daquele dia, em UTC. */
function exclusiveEnd(value: string): Date {
  const date = new Date(value);

  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    date.setUTCDate(date.getUTCDate() + 1);
  }

  return date;
}
