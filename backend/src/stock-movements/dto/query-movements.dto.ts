import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { MovementReason, MovementType } from '../../generated/prisma/enums';

/**
 * Colunas pelas quais o histórico pode ser ordenado.
 *
 * `createdAt` é o padrão, decrescente — o mais recente primeiro
 * (docs/05-api.md §5.7). `quantity` é a magnitude, útil para achar os maiores
 * lançamentos de um período.
 */
export const MOVEMENT_SORT_COLUMNS = ['createdAt', 'quantity'] as const;
export type MovementSortColumn = (typeof MOVEMENT_SORT_COLUMNS)[number];

export class QueryMovementsDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: MOVEMENT_SORT_COLUMNS, default: 'createdAt' })
  @IsOptional()
  @IsString()
  sort?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('7', { message: 'productId deve ser um UUID válido.' })
  productId?: string;

  @ApiPropertyOptional({ enum: MovementType })
  @IsOptional()
  @IsEnum(MovementType, { message: 'Tipo de movimentação inválido.' })
  type?: MovementType;

  @ApiPropertyOptional({ enum: MovementReason })
  @IsOptional()
  @IsEnum(MovementReason, { message: 'Motivo de movimentação inválido.' })
  reason?: MovementReason;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('7', { message: 'userId deve ser um UUID válido.' })
  userId?: string;

  /**
   * ISO 8601 (data ou data e hora). Sem horário, o intervalo é SEMIABERTO e
   * inclui o dia inteiro, em UTC (docs/17-plano-fase-5.md, decisão D16):
   * `dateFrom` passa a valer às 00:00:00Z daquele dia.
   */
  @ApiPropertyOptional({ example: '2026-10-01' })
  @IsOptional()
  @IsDateString({}, { message: 'dateFrom deve ser uma data ISO 8601 válida.' })
  dateFrom?: string;

  /** Como `dateFrom`: sem horário, `dateTo` vale até o fim daquele dia (exclusivo o dia seguinte), em UTC. */
  @ApiPropertyOptional({ example: '2026-10-31' })
  @IsOptional()
  @IsDateString({}, { message: 'dateTo deve ser uma data ISO 8601 válida.' })
  dateTo?: string;
}
