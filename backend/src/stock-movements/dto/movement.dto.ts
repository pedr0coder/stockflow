import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { MovementReason, MovementType } from '../../generated/prisma/enums';

/** Autor de um movimento, só o necessário para exibição (docs/05-api.md §5.7). */
export class MovementUserDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  name!: string;
}

/** Produto movimentado, só o necessário para identificação e navegação rápida (docs/05-api.md §5.7). */
export class MovementProductDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  sku!: string;
}

/**
 * Movimentação como a API a devolve.
 *
 * Decimais em **string**, na escala da coluna — o mesmo contrato dos demais
 * recursos (docs/05-api.md §5.7). `stockBefore`/`stockAfter` vêm sempre do
 * `RETURNING` do UPDATE condicional que decidiu o saldo, nunca de uma leitura
 * anterior (ADR-0003).
 */
export class MovementDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  productId!: string;

  @ApiPropertyOptional({ type: MovementProductDto })
  product?: MovementProductDto;

  @ApiProperty({ enum: MovementType })
  type!: MovementType;

  @ApiProperty({ enum: MovementReason })
  reason!: MovementReason;

  @ApiProperty({ type: String, example: '12.500' })
  quantity!: string;

  @ApiProperty({ type: String, example: '40.000' })
  stockBefore!: string;

  @ApiProperty({ type: String, example: '27.500' })
  stockAfter!: string;

  @ApiPropertyOptional({ nullable: true })
  note!: string | null;

  @ApiPropertyOptional({ nullable: true })
  referenceDoc!: string | null;

  @ApiPropertyOptional({ nullable: true })
  inventoryItemId!: string | null;

  @ApiProperty({ type: MovementUserDto })
  user!: MovementUserDto;

  @ApiProperty()
  createdAt!: Date;
}
