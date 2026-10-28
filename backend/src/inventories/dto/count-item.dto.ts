import { ApiProperty } from '@nestjs/swagger';
import { IsFinalQuantity } from '../../common/utils/quantity.validators';

/**
 * Contagem de um item: quantidade física, zero ou mais (mesma validação do
 * ajuste manual — valor absoluto, não delta, docs/17-plano-fase-5.md §17.6.3).
 */
export class CountItemDto {
  @ApiProperty({ example: '12.500' })
  @IsFinalQuantity({
    message: 'countedQty deve ser um decimal válido, zero ou maior, até 3 casas.',
  })
  countedQty!: string;
}
