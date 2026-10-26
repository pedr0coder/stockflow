import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEnum, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import { MovementReason } from '../../generated/prisma/enums';
import { trimValue } from '../../common/utils/transform';
import { IsPositiveQuantity } from '../../common/utils/quantity.validators';

const MAX_REFERENCE_DOC_LENGTH = 80;
const MAX_NOTE_LENGTH = 500;

/**
 * Corpo de `POST /stock-movements/in` e `POST /stock-movements/out`.
 *
 * `type` não é campo: vem da rota, não do corpo. `userId`, `stockBefore`,
 * `stockAfter`, `inventoryItemId`, `createdAt` e `id` nunca são aceitos —
 * `forbidNonWhitelisted` os recusa com 400 antes de chegarem ao service
 * (docs/08-seguranca.md §8.4, docs/17-plano-fase-5.md §17.4.1).
 *
 * `reason` aceita qualquer valor do enum aqui; a combinação com o `type` da
 * rota é validada no service (`movement-rules.ts`), porque a allowlist muda
 * conforme a rota e não cabe numa única anotação de DTO.
 */
export class CreateMovementDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('7', { message: 'productId deve ser um UUID válido.' })
  productId!: string;

  @ApiProperty({
    example: '12.500',
    description: 'Decimal em string, maior que zero, até 3 casas.',
  })
  @IsString()
  @IsPositiveQuantity()
  quantity!: string;

  @ApiProperty({ enum: MovementReason })
  @IsEnum(MovementReason, { message: 'Motivo de movimentação inválido.' })
  reason!: MovementReason;

  @ApiPropertyOptional({ maxLength: MAX_REFERENCE_DOC_LENGTH, example: 'REQ-2026-0455' })
  @IsOptional()
  @IsString()
  @Transform(trimValue)
  @MaxLength(MAX_REFERENCE_DOC_LENGTH)
  referenceDoc?: string;

  @ApiPropertyOptional({ maxLength: MAX_NOTE_LENGTH })
  @IsOptional()
  @IsString()
  @Transform(trimValue)
  @MinLength(1)
  @MaxLength(MAX_NOTE_LENGTH)
  note?: string;
}
