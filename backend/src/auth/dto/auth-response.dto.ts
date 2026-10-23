import { ApiProperty } from '@nestjs/swagger';
import { UserRole } from '../../generated/prisma/enums';

/**
 * Usuário exposto pela API.
 *
 * `passwordHash` não aparece aqui nem poderia: o campo é omitido na origem,
 * na configuração do cliente Prisma. Esta classe é a segunda camada, e o teste
 * que afirma a ausência no corpo da resposta é a terceira.
 *
 * **Declarada antes de quem a usa, de propósito.** Com `emitDecoratorMetadata`
 * ligado, o `design:type` de cada propriedade é avaliado quando o módulo
 * carrega, e não quando a classe é instanciada. Declarar depois produz
 * `ReferenceError: Cannot access 'AuthUserDto' before initialization` no boot,
 * que foi exatamente o que aconteceu aqui antes desta reordenação.
 */
export class AuthUserDto {
  @ApiProperty({ example: '01a148b9-0000-7000-8000-000000000001' })
  id!: string;

  @ApiProperty({ example: 'Ana Souza' })
  name!: string;

  @ApiProperty({ example: 'ana@empresa.com.br' })
  email!: string;

  @ApiProperty({ enum: UserRole, example: UserRole.OPERATOR })
  role!: UserRole;
}

/**
 * Resposta do login e do refresh.
 *
 * Repare no que **não** está aqui: o refresh token. Ele vai em cookie
 * `httpOnly`, fora do alcance do JavaScript da página, e devolvê-lo também no
 * corpo anularia a proteção inteira (ADR-0005).
 */
export class AuthTokenResponseDto {
  @ApiProperty({ description: 'Access token JWT. Guarde em memória, nunca em localStorage.' })
  accessToken!: string;

  @ApiProperty({ example: 900, description: 'Validade do access token, em segundos.' })
  expiresIn!: number;

  @ApiProperty({ type: () => AuthUserDto })
  user!: AuthUserDto;
}
