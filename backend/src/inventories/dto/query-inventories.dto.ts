import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsIn, IsOptional, IsString } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { InventoryStatus } from '../../generated/prisma/enums';

export const INVENTORY_SORT_COLUMNS = ['startedAt'] as const;
export type InventorySortColumn = (typeof INVENTORY_SORT_COLUMNS)[number];

export class QueryInventoriesDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: INVENTORY_SORT_COLUMNS, default: 'startedAt' })
  @IsOptional()
  @IsString()
  @IsIn(INVENTORY_SORT_COLUMNS, { message: 'sort deve ser startedAt.' })
  sort?: InventorySortColumn;

  @ApiPropertyOptional({ enum: InventoryStatus })
  @IsOptional()
  @IsEnum(InventoryStatus, { message: 'status inválido.' })
  status?: InventoryStatus;
}
