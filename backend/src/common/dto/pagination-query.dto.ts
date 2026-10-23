import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { toIntValue, trimValue } from '../utils/transform';

/**
 * Teto de registros por página, aplicado **no servidor**.
 *
 * Sem ele, `?limit=100000` viraria varredura de tabela a pedido do cliente
 * (docs/05-api.md §5.1). O cliente pode pedir menos, nunca mais.
 */
export const MAX_PAGE_SIZE = 100;
export const DEFAULT_PAGE_SIZE = 20;

export type SortOrder = 'asc' | 'desc';

/** Converte para inteiro e aplica o teto do servidor. */
function clampLimit(params: { value: unknown }): unknown {
  const parsed = toIntValue(params);

  return typeof parsed === 'number' ? Math.min(parsed, MAX_PAGE_SIZE) : parsed;
}

/**
 * Parâmetros comuns a toda listagem.
 *
 * O campo `sort` **não** é validado aqui: a lista de colunas permitidas é
 * diferente por recurso, e cada controller declara a sua estendendo este DTO.
 * Validar contra uma allowlist é obrigatório, porque passar um nome de coluna
 * arbitrário direto ao `orderBy` do ORM seria superfície de ataque e de erro.
 */
export class PaginationQueryDto {
  @ApiPropertyOptional({ minimum: 1, default: 1 })
  @IsOptional()
  @Transform(toIntValue)
  @IsInt({ message: 'page deve ser um número inteiro' })
  @Min(1, { message: 'page deve ser maior ou igual a 1' })
  page: number = 1;

  /**
   * Tamanho da página, **limitado** no servidor em vez de recusado.
   *
   * Pedir 500 devolve 100, e não 400. É o comportamento descrito na §5.1 e
   * esperado pelo caso de teste da §7.4: o cliente que pede demais recebe o
   * máximo, e a listagem continua funcionando. Recusar transformaria um
   * excesso inofensivo em erro de integração.
   */
  @ApiPropertyOptional({ minimum: 1, maximum: MAX_PAGE_SIZE, default: DEFAULT_PAGE_SIZE })
  @IsOptional()
  @Transform(clampLimit)
  @IsInt({ message: 'limit deve ser um número inteiro' })
  @Min(1, { message: 'limit deve ser maior ou igual a 1' })
  limit: number = DEFAULT_PAGE_SIZE;

  @ApiPropertyOptional({ enum: ['asc', 'desc'], default: 'asc' })
  @IsOptional()
  @IsIn(['asc', 'desc'], { message: 'order deve ser asc ou desc' })
  order: SortOrder = 'asc';

  @ApiPropertyOptional({ description: 'Busca textual. O campo pesquisado varia por recurso.' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  @Transform(trimValue)
  search?: string;
}
