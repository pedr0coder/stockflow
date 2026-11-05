import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { trimValue } from '../../common/utils/transform';

/** Colunas pelas quais o log pode ser ordenado. */
export const AUDIT_SORT_COLUMNS = ['createdAt', 'action', 'entity'] as const;
export type AuditSortColumn = (typeof AUDIT_SORT_COLUMNS)[number];

export class QueryAuditDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: AUDIT_SORT_COLUMNS, default: 'createdAt' })
  @IsOptional()
  @IsString()
  sort?: string;

  @ApiPropertyOptional({ description: 'Filtra por ação, por exemplo LOGIN_SUCCESS.' })
  @IsOptional()
  @IsString()
  @Transform(trimValue)
  @MaxLength(60)
  action?: string;

  @ApiPropertyOptional({ description: 'Filtra por entidade, por exemplo Product.' })
  @IsOptional()
  @IsString()
  @Transform(trimValue)
  @MaxLength(40)
  entity?: string;

  @ApiPropertyOptional({ description: 'Filtra pelo autor da ação.' })
  @IsOptional()
  @IsUUID('7', { message: 'userId deve ser um UUID válido.' })
  userId?: string;
}
