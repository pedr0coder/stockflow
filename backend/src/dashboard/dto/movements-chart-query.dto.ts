import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { toIntValue } from '../../common/utils/transform';

export class MovementsChartQueryDto {
  @ApiPropertyOptional({ minimum: 1, maximum: 90, default: 30 })
  @IsOptional()
  @Transform(toIntValue)
  @IsInt({ message: 'days deve ser um número inteiro.' })
  @Min(1, { message: 'days deve ser maior ou igual a 1.' })
  @Max(90, { message: 'days deve ser menor ou igual a 90.' })
  days: number = 30;
}
