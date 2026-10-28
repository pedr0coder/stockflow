import { ApiProperty } from '@nestjs/swagger';

export class LowStockItemDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  sku!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ type: String })
  currentStock!: string;

  @ApiProperty({ type: String })
  minStock!: string;

  @ApiProperty({ type: String })
  deficit!: string;
}

export class OutOfStockItemDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  sku!: string;

  @ApiProperty()
  name!: string;
}

export class MovementsReportRowDto {
  @ApiProperty()
  type!: string;

  @ApiProperty()
  reason!: string;

  @ApiProperty()
  movementsCount!: number;

  @ApiProperty({ type: String })
  totalQuantity!: string;
}

export class InventoryReportRowDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  code!: string;

  @ApiProperty()
  status!: string;

  @ApiProperty()
  startedAt!: Date;

  @ApiProperty({ nullable: true })
  closedAt!: Date | null;

  @ApiProperty()
  itemsCount!: number;

  @ApiProperty()
  countedCount!: number;

  @ApiProperty()
  adjustedCount!: number;
}

export class DivergenceRowDto {
  @ApiProperty()
  inventoryId!: string;

  @ApiProperty()
  inventoryCode!: string;

  @ApiProperty()
  itemId!: string;

  @ApiProperty()
  productId!: string;

  @ApiProperty()
  productName!: string;

  @ApiProperty({ type: String })
  expectedQty!: string;

  @ApiProperty({ type: String })
  countedQty!: string;

  @ApiProperty({ type: String })
  movedSinceCount!: string;
}

export class ReconciliationRowDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  sku!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ type: String })
  currentStock!: string;

  @ApiProperty({ type: String })
  derivedStock!: string;

  @ApiProperty({ type: String })
  difference!: string;
}
