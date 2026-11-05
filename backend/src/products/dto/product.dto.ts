import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { UnitOfMeasure } from '../../generated/prisma/enums';
import { toBooleanValue, trimUpperValue, trimValue } from '../../common/utils/transform';

const MAX_SKU_LENGTH = 40;
const MAX_NAME_LENGTH = 160;

/**
 * Decimal com até três casas, que é a escala de `Decimal(14,3)` no banco.
 *
 * Validado por regex **antes** de virar `Decimal` (docs/08-seguranca.md §8.4).
 * Aceitar quatro casas aqui faria o banco arredondar em silêncio, e o saldo
 * exibido divergiria do enviado sem nenhum erro.
 */
const QUANTITY_PATTERN = /^\d+(\.\d{1,3})?$/;

/** Custo usa quatro casas, espelhando `Decimal(14,4)`. */
const COST_PATTERN = /^\d+(\.\d{1,4})?$/;

export class CreateProductDto {
  @ApiProperty({ maxLength: MAX_SKU_LENGTH, example: 'FER-0001' })
  @IsString()
  // Normalizado para maiúsculas, como o banco armazena: assim "fer-0001" e
  // "FER-0001" colidem no índice único, que é o comportamento desejado.
  @Transform(trimUpperValue)
  @MinLength(2)
  @MaxLength(MAX_SKU_LENGTH)
  sku!: string;

  @ApiProperty({ maxLength: MAX_NAME_LENGTH })
  @IsString()
  @Transform(trimValue)
  @MinLength(2)
  @MaxLength(MAX_NAME_LENGTH)
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Transform(trimValue)
  @MaxLength(1000)
  description?: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID('7', { message: 'categoryId deve ser um UUID válido.' })
  categoryId!: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('7', { message: 'supplierId deve ser um UUID válido.' })
  supplierId?: string;

  @ApiProperty({ enum: UnitOfMeasure })
  @IsEnum(UnitOfMeasure, { message: 'Unidade de medida inválida.' })
  unit!: UnitOfMeasure;

  @ApiPropertyOptional({ example: '10.000', description: 'Decimal em string, até 3 casas.' })
  @IsOptional()
  @IsString()
  @Matches(QUANTITY_PATTERN, {
    message: 'minStock deve ser um decimal com até 3 casas, como "10.000".',
  })
  minStock?: string;

  @ApiPropertyOptional({ example: '12.9000', description: 'Decimal em string, até 4 casas.' })
  @IsOptional()
  @IsString()
  @Matches(COST_PATTERN, {
    message: 'unitCost deve ser um decimal com até 4 casas, como "12.9000".',
  })
  unitCost?: string;
}

/**
 * Atualização de dados cadastrais.
 *
 * `currentStock` **não** está aqui, e não é esquecimento: saldo só muda por
 * movimentação (docs/05-api.md §5.6). Se o cadastro pudesse alterá-lo, o
 * histórico deixaria de explicar o saldo. Tentar enviá-lo devolve 400, porque
 * o ValidationPipe roda com `forbidNonWhitelisted`.
 */
export class UpdateProductDto extends PartialType(CreateProductDto) {}

export class ChangeProductStatusDto {
  @ApiProperty()
  @IsBoolean({ message: 'isActive deve ser booleano.' })
  isActive!: boolean;
}

export const PRODUCT_SORT_COLUMNS = [
  'name',
  'sku',
  'currentStock',
  'createdAt',
  'updatedAt',
] as const;

export const STOCK_STATUS = ['low', 'out', 'ok'] as const;
export type StockStatusFilter = (typeof STOCK_STATUS)[number];

export class QueryProductsDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: PRODUCT_SORT_COLUMNS, default: 'name' })
  @IsOptional()
  @IsString()
  sort?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('7')
  categoryId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('7')
  supplierId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(toBooleanValue)
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ enum: STOCK_STATUS })
  @IsOptional()
  @IsIn(STOCK_STATUS, { message: 'stockStatus deve ser low, out ou ok.' })
  stockStatus?: StockStatusFilter;
}

/**
 * Produto como a API o devolve.
 *
 * Os decimais trafegam como **string**, não como número. `number` em
 * JavaScript é IEEE-754 e perderia precisão em quantidade e custo, pelo mesmo
 * motivo que o banco usa `Decimal` (docs/05-api.md §5.7).
 */
export class ProductDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  sku!: string;

  @ApiProperty()
  name!: string;

  @ApiPropertyOptional({ nullable: true })
  description!: string | null;

  @ApiProperty()
  categoryId!: string;

  @ApiPropertyOptional({ nullable: true })
  supplierId!: string | null;

  @ApiProperty({ enum: UnitOfMeasure })
  unit!: UnitOfMeasure;

  @ApiProperty({ type: String, example: '42.000' })
  currentStock!: string;

  @ApiProperty({ type: String, example: '10.000' })
  minStock!: string;

  @ApiProperty({ type: String, example: '12.9000' })
  unitCost!: string;

  @ApiProperty()
  isActive!: boolean;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;
}
