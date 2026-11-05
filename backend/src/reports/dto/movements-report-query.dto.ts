import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional } from 'class-validator';
import { IsIsoDateOrDateTime } from '../../common/utils/date.validators';

export class MovementsReportQueryDto {
  @ApiPropertyOptional({ example: '2026-10-01' })
  @IsOptional()
  @IsIsoDateOrDateTime({ message: 'dateFrom deve ser uma data ISO 8601 válida.' })
  dateFrom?: string;

  @ApiPropertyOptional({ example: '2026-10-31' })
  @IsOptional()
  @IsIsoDateOrDateTime({ message: 'dateTo deve ser uma data ISO 8601 válida.' })
  dateTo?: string;
}
