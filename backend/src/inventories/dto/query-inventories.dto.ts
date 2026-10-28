import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { InventoryStatus } from '../../generated/prisma/enums';

export const INVENTORY_SORT_COLUMNS = ['startedAt'] as const;

export class QueryInventoriesDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: InventoryStatus })
  @IsOptional()
  @IsEnum(InventoryStatus, { message: 'status inválido.' })
  status?: InventoryStatus;
}
