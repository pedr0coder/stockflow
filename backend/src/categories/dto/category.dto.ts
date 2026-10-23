import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { toBooleanValue, trimValue } from '../../common/utils/transform';

const MAX_NAME_LENGTH = 80;

export class CreateCategoryDto {
  @ApiProperty({ maxLength: MAX_NAME_LENGTH })
  @IsString()
  @Transform(trimValue)
  @MinLength(2, { message: 'O nome deve ter no mínimo 2 caracteres.' })
  @MaxLength(MAX_NAME_LENGTH)
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  @Transform(trimValue)
  description?: string;
}

export class UpdateCategoryDto extends PartialType(CreateCategoryDto) {}

export class ChangeCategoryStatusDto {
  @ApiProperty()
  @IsBoolean({ message: 'isActive deve ser booleano.' })
  isActive!: boolean;
}

export const CATEGORY_SORT_COLUMNS = ['name', 'createdAt', 'updatedAt'] as const;

export class QueryCategoriesDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: CATEGORY_SORT_COLUMNS, default: 'name' })
  @IsOptional()
  @IsString()
  sort?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(toBooleanValue)
  @IsBoolean()
  isActive?: boolean;
}

export class CategoryDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiPropertyOptional({ nullable: true })
  description!: string | null;

  @ApiProperty()
  isActive!: boolean;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;
}
