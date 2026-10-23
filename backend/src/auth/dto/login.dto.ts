import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';
import { trimLowerValue } from '../../common/utils/transform';

/**
 * Política de senha da docs/08-seguranca.md §8.1, alinhada ao NIST SP 800-63B.
 *
 * O mesmo valor existe em `frontend/src/lib/validation-rules.ts`, com o mesmo
 * nome. A duplicação é a mitigação acordada no ADR-0002, e um teste de contrato
 * na Fase 6 verifica que os dois lados coincidem.
 */
export const MIN_PASSWORD_LENGTH = 10;
export const MAX_PASSWORD_LENGTH = 128;
export const MAX_EMAIL_LENGTH = 180;

export class LoginDto {
  @ApiProperty({ example: 'ana@empresa.com.br', maxLength: MAX_EMAIL_LENGTH })
  @IsString()
  // Normalizado na borda, como o banco armazena: sem isso, "Ana@x.com" e
  // "ana@x.com" seriam contas diferentes para quem digita.
  @Transform(trimLowerValue)
  @IsEmail({}, { message: 'Informe um e-mail válido.' })
  @MaxLength(MAX_EMAIL_LENGTH)
  email!: string;

  @ApiProperty({ minLength: MIN_PASSWORD_LENGTH, maxLength: MAX_PASSWORD_LENGTH })
  @IsString()
  @MinLength(MIN_PASSWORD_LENGTH, {
    message: `A senha deve ter no mínimo ${MIN_PASSWORD_LENGTH} caracteres.`,
  })
  // Teto para que uma senha de megabytes não vire trabalho de hash sob demanda
  // do cliente. O Argon2id não tem o limite de 72 bytes do bcrypt, mas aceitar
  // entrada sem limite é convite a abuso.
  @MaxLength(MAX_PASSWORD_LENGTH)
  password!: string;
}
