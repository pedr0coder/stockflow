import { ApiProperty } from '@nestjs/swagger';

export class DashboardSummaryDto {
  @ApiProperty()
  activeProducts!: number;

  @ApiProperty()
  lowStock!: number;

  @ApiProperty()
  outOfStock!: number;

  @ApiProperty()
  movementsLast30Days!: number;
}

export class MovementsChartPointDto {
  @ApiProperty({ example: '2026-10-01' })
  day!: string;

  @ApiProperty({ enum: ['IN', 'OUT', 'ADJUSTMENT'] })
  type!: string;

  @ApiProperty()
  total!: number;
}

export class RecentMovementDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  productId!: string;

  @ApiProperty()
  productName!: string;

  @ApiProperty()
  type!: string;

  @ApiProperty()
  reason!: string;

  @ApiProperty({ type: String })
  quantity!: string;

  @ApiProperty({ type: String })
  stockAfter!: string;

  @ApiProperty()
  userName!: string;

  @ApiProperty()
  createdAt!: Date;
}
