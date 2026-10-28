import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

/**
 * Abertura de inventário: seleciona de 1 a 200 produtos (docs/17-plano-fase-5.md
 * §17.4.3, D11). O teto é regra de negócio, não o máximo de bytes que o corpo
 * comportaria — um depósito maior abre vários inventários disjuntos.
 */
export class OpenInventoryDto {
  @ApiProperty({ type: [String], minItems: 1, maxItems: 200 })
  @IsUUID('7', { each: true, message: 'productIds deve conter apenas UUIDs válidos.' })
  @ArrayMinSize(1, { message: 'Selecione ao menos um produto.' })
  @ArrayMaxSize(200, { message: 'No máximo 200 produtos por inventário.' })
  @ArrayUnique({ message: 'productIds não pode repetir o mesmo produto.' })
  productIds!: string[];

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
