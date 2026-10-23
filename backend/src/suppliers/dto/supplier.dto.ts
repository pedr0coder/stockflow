import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { toBooleanValue, trimLowerValue, trimValue } from '../../common/utils/transform';

const MAX_NAME_LENGTH = 140;

/**
 * CNPJ ou CPF com a pontuação usual.
 *
 * A validação é de **forma**, não de dígito verificador: conferir o DV exigiria
 * uma regra por tipo de documento e não impediria um documento válido de outra
 * empresa. O campo é único no banco, que é o que de fato evita duplicata.
 */
const TAX_ID_PATTERN = /^(\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}|\d{3}\.\d{3}\.\d{3}-\d{2})$/;

export class CreateSupplierDto {
  @ApiProperty({ maxLength: MAX_NAME_LENGTH })
  @IsString()
  @Transform(trimValue)
  @MinLength(2)
  @MaxLength(MAX_NAME_LENGTH)
  name!: string;

  @ApiPropertyOptional({ example: '11.111.111/0001-11' })
  @IsOptional()
  @IsString()
  @Transform(trimValue)
  @Matches(TAX_ID_PATTERN, {
    message: 'Informe um CNPJ (00.000.000/0000-00) ou CPF (000.000.000-00).',
  })
  taxId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trimLowerValue)
  @IsEmail({}, { message: 'Informe um e-mail válido.' })
  @MaxLength(180)
  email?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}

export class UpdateSupplierDto extends PartialType(CreateSupplierDto) {}

export class ChangeSupplierStatusDto {
  @ApiProperty()
  @IsBoolean({ message: 'isActive deve ser booleano.' })
  isActive!: boolean;
}

export const SUPPLIER_SORT_COLUMNS = ['name', 'createdAt', 'updatedAt'] as const;

export class QuerySuppliersDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: SUPPLIER_SORT_COLUMNS, default: 'name' })
  @IsOptional()
  @IsString()
  sort?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(toBooleanValue)
  @IsBoolean()
  isActive?: boolean;
}

export class SupplierDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiPropertyOptional({ nullable: true })
  taxId!: string | null;

  @ApiPropertyOptional({ nullable: true })
  email!: string | null;

  @ApiPropertyOptional({ nullable: true })
  phone!: string | null;

  @ApiPropertyOptional({ nullable: true })
  notes!: string | null;

  @ApiProperty()
  isActive!: boolean;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;
}
