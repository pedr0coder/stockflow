import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { InventoryStatus } from '../../generated/prisma/enums';

export class InventoryUserDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  name!: string;
}

/**
 * Item de inventário, com os campos derivados que o aprovador precisa ver
 * ANTES de aprovar (docs/17-plano-fase-5.md §17.4.3, §17.6.7). Nenhum desses
 * campos é coluna: `divergence`, `movedSinceCount` e `movementsSinceCount` são
 * calculados na consulta — persistir um valor derivado abriria espaço para
 * ele ficar inconsistente com o que gerou.
 */
export class InventoryItemDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  productId!: string;

  @ApiPropertyOptional({ nullable: true, type: String, example: '40.000' })
  expectedQty!: string | null;

  @ApiPropertyOptional({ nullable: true, type: String, example: '38.000' })
  countedQty!: string | null;

  /** `countedQty − expectedQty`. `null` enquanto o item não foi contado. */
  @ApiPropertyOptional({ nullable: true, type: String, example: '-2.000' })
  divergence!: string | null;

  @ApiPropertyOptional({ nullable: true })
  countedAt!: Date | null;

  @ApiPropertyOptional({ nullable: true, type: InventoryUserDto })
  countedBy!: InventoryUserDto | null;

  /**
   * Saldo atual do produto, e o quanto ele já se moveu desde a contagem
   * (`currentStock − expectedQty`) e quantos movimentos isso representa.
   * `null` enquanto o item não foi contado — não há "desde a contagem" ainda.
   */
  @ApiPropertyOptional({ nullable: true, type: String, example: '36.000' })
  currentStock!: string | null;

  @ApiPropertyOptional({ nullable: true, type: String, example: '-2.000' })
  movedSinceCount!: string | null;

  @ApiPropertyOptional({ nullable: true })
  movementsSinceCount!: number | null;
}

export class InventoryDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({ example: 'INV-2026-0001' })
  code!: string;

  @ApiProperty({ enum: InventoryStatus })
  status!: InventoryStatus;

  @ApiPropertyOptional({ nullable: true })
  note!: string | null;

  @ApiProperty()
  startedAt!: Date;

  @ApiPropertyOptional({ nullable: true })
  closedAt!: Date | null;

  @ApiProperty({ type: InventoryUserDto })
  createdBy!: InventoryUserDto;

  @ApiPropertyOptional({ nullable: true, type: InventoryUserDto })
  approvedBy!: InventoryUserDto | null;

  @ApiPropertyOptional({ nullable: true })
  approvedAt!: Date | null;

  @ApiPropertyOptional({ type: [InventoryItemDto] })
  items?: InventoryItemDto[];
}

/** Um item ajustado pela aprovação, na resposta de `POST .../approve`. */
export class InventoryAdjustmentDto {
  @ApiProperty()
  inventoryItemId!: string;

  @ApiProperty()
  productId!: string;

  @ApiProperty({ type: String, example: '-2.000' })
  appliedDelta!: string;

  @ApiProperty({ type: String, example: '0.000' })
  movedSinceCount!: string;

  @ApiProperty({ type: String, example: '40.000' })
  stockBefore!: string;

  @ApiProperty({ type: String, example: '38.000' })
  stockAfter!: string;

  @ApiProperty()
  movementId!: string;
}

export class InventoryApprovalResultDto {
  @ApiProperty({ type: InventoryDto })
  inventory!: InventoryDto;

  @ApiProperty({ type: [InventoryAdjustmentDto] })
  adjustments!: InventoryAdjustmentDto[];

  @ApiProperty()
  adjustedItemsCount!: number;
}
