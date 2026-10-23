import { ApiProperty, ApiPropertyOptional, PartialType, PickType } from '@nestjs/swagger';
import { Exclude } from 'class-transformer';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import {
  MAX_EMAIL_LENGTH,
  MAX_PASSWORD_LENGTH,
  MIN_PASSWORD_LENGTH,
} from '../../auth/dto/login.dto';
import { UserRole } from '../../generated/prisma/enums';
import { toBooleanValue, trimLowerValue, trimValue } from '../../common/utils/transform';

const MAX_NAME_LENGTH = 120;

export class CreateUserDto {
  @ApiProperty({ maxLength: MAX_NAME_LENGTH })
  @IsString()
  @Transform(trimValue)
  @MinLength(2, { message: 'O nome deve ter no mínimo 2 caracteres.' })
  @MaxLength(MAX_NAME_LENGTH)
  name!: string;

  @ApiProperty({ maxLength: MAX_EMAIL_LENGTH })
  @IsString()
  @Transform(trimLowerValue)
  @IsEmail({}, { message: 'Informe um e-mail válido.' })
  @MaxLength(MAX_EMAIL_LENGTH)
  email!: string;

  @ApiProperty({ minLength: MIN_PASSWORD_LENGTH })
  @IsString()
  @MinLength(MIN_PASSWORD_LENGTH, {
    message: `A senha deve ter no mínimo ${MIN_PASSWORD_LENGTH} caracteres.`,
  })
  @MaxLength(MAX_PASSWORD_LENGTH)
  password!: string;

  @ApiProperty({ enum: UserRole })
  @IsEnum(UserRole, { message: 'Papel inválido.' })
  role!: UserRole;
}

/**
 * Atualização de dados cadastrais.
 *
 * `PickType` em vez de `PartialType(CreateUserDto)` de propósito: herdar tudo
 * permitiria enviar `password` e `role` por aqui, contornando os endpoints
 * dedicados que existem justamente para auditar essas duas mudanças em
 * separado.
 */
export class UpdateUserDto extends PartialType(
  PickType(CreateUserDto, ['name', 'email'] as const),
) {}

export class ChangeRoleDto {
  @ApiProperty({ enum: UserRole })
  @IsEnum(UserRole, { message: 'Papel inválido.' })
  role!: UserRole;
}

export class ChangeStatusDto {
  @ApiProperty({ example: false })
  @IsBoolean({ message: 'isActive deve ser booleano.' })
  isActive!: boolean;
}

export class ChangePasswordDto {
  @ApiProperty({ description: 'Senha atual, exigida para confirmar a identidade.' })
  @IsString()
  @MinLength(1, { message: 'Informe a senha atual.' })
  @MaxLength(MAX_PASSWORD_LENGTH)
  currentPassword!: string;

  @ApiProperty({ minLength: MIN_PASSWORD_LENGTH })
  @IsString()
  @MinLength(MIN_PASSWORD_LENGTH, {
    message: `A nova senha deve ter no mínimo ${MIN_PASSWORD_LENGTH} caracteres.`,
  })
  @MaxLength(MAX_PASSWORD_LENGTH)
  newPassword!: string;
}

export const USER_SORT_COLUMNS = ['name', 'email', 'role', 'createdAt'] as const;

export class QueryUsersDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: USER_SORT_COLUMNS, default: 'name' })
  @IsOptional()
  @IsString()
  sort?: string;

  @ApiPropertyOptional({ enum: UserRole })
  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(toBooleanValue)
  @IsBoolean()
  isActive?: boolean;
}

/**
 * Usuário como a API o devolve.
 *
 * `@Exclude()` em `passwordHash` é a **segunda** camada de proteção. A
 * primeira é a omissão global na configuração do cliente Prisma, que impede o
 * campo de sair do banco; esta garante que, se alguém pedir o campo
 * explicitamente e devolver a entidade, o serializador ainda o retire.
 *
 * A terceira é o teste que afirma a ausência do campo no corpo da resposta.
 */
export class UserDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  email!: string;

  @ApiProperty({ enum: UserRole })
  role!: UserRole;

  @ApiProperty()
  isActive!: boolean;

  @ApiPropertyOptional({ nullable: true })
  lastLoginAt!: Date | null;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;

  @Exclude()
  passwordHash?: string;
}
