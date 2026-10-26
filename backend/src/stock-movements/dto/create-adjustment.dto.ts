import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEnum, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import { MovementReason } from '../../generated/prisma/enums';
import { trimValue } from '../../common/utils/transform';
import { IsFinalQuantity } from '../../common/utils/quantity.validators';

const MAX_REFERENCE_DOC_LENGTH = 80;
const MAX_NOTE_LENGTH = 500;
const MIN_NOTE_LENGTH = 3;

/**
 * Corpo de `POST /stock-movements/adjustment`.
 *
 * O campo chama-se `finalQuantity`, e não `quantity` (docs/17-plano-fase-5.md
 * I3, decisão D7): no `StockMovement`, `quantity` é sempre a MAGNITUDE do
 * movimento; o que o cliente envia aqui é a quantidade final que o estoque
 * deve ter, que pode ser `0.000`. Um DTO que reaproveitasse o nome `quantity`
 * induziria o cliente a mandar um delta, esperando o comportamento de
 * entrada/saída.
 *
 * `note` é OBRIGATÓRIA aqui (decisão D7): um ajuste manual altera o saldo sem
 * o lastro de uma entrada ou saída físicas, e a nota é a justificativa do ato.
 *
 * `reason` só aceita `CORRECTION` em tempo de execução (validado no service):
 * `INVENTORY_ADJUSTMENT` é reservado à aprovação de inventário (Fase 5B), e
 * aceitá-lo aqui permitiria forjar um ajuste com cara de contagem.
 */
export class CreateAdjustmentDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('7', { message: 'productId deve ser um UUID válido.' })
  productId!: string;

  @ApiProperty({
    example: '7.000',
    description: 'Quantidade final do estoque, decimal em string, até 3 casas.',
  })
  @IsString()
  @IsFinalQuantity()
  finalQuantity!: string;

  @ApiProperty({ enum: MovementReason, example: MovementReason.CORRECTION })
  @IsEnum(MovementReason, { message: 'Motivo de movimentação inválido.' })
  reason!: MovementReason;

  @ApiPropertyOptional({ maxLength: MAX_REFERENCE_DOC_LENGTH })
  @IsOptional()
  @IsString()
  @Transform(trimValue)
  @MaxLength(MAX_REFERENCE_DOC_LENGTH)
  referenceDoc?: string;

  @ApiProperty({ minLength: MIN_NOTE_LENGTH, maxLength: MAX_NOTE_LENGTH })
  @IsString()
  @Transform(trimValue)
  @MinLength(MIN_NOTE_LENGTH, {
    message: `note deve ter ao menos ${String(MIN_NOTE_LENGTH)} caracteres.`,
  })
  @MaxLength(MAX_NOTE_LENGTH)
  note!: string;
}
