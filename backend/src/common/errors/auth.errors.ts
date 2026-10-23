import { HttpStatus } from '@nestjs/common';
import { DomainError } from './domain.error';
import { ErrorCode } from './error-codes';

/**
 * Credencial inválida.
 *
 * Usada tanto para senha errada quanto para usuário inexistente, e isso é
 * deliberado: respostas diferentes permitiriam descobrir quais e-mails existem
 * no sistema testando um por um.
 *
 * `details` fica vazio de propósito. Qualquer contexto aqui seria pista sobre
 * o que falhou.
 */
export class InvalidCredentialsError extends DomainError {
  override readonly code = ErrorCode.INVALID_CREDENTIALS;
  override readonly httpStatus = HttpStatus.UNAUTHORIZED;

  constructor() {
    super('E-mail ou senha inválidos.');
  }
}

/**
 * Usuário desativado.
 *
 * Diferente de `InvalidCredentialsError` de propósito: quem teve a conta
 * desativada precisa saber disso para procurar um administrador, e a
 * informação só chega a quem já provou conhecer a senha correta.
 */
export class UserInactiveError extends DomainError {
  override readonly code = ErrorCode.USER_INACTIVE;
  override readonly httpStatus = HttpStatus.UNAUTHORIZED;

  constructor() {
    super('Esta conta está desativada. Procure um administrador.');
  }
}

/**
 * Refresh token ausente, expirado ou revogado.
 *
 * Também cobre o token que nunca existiu: distinguir os casos diria a um
 * atacante se o token que ele tem já existiu algum dia.
 */
export class InvalidRefreshTokenError extends DomainError {
  override readonly code = ErrorCode.UNAUTHORIZED;
  override readonly httpStatus = HttpStatus.UNAUTHORIZED;

  constructor() {
    super('Sessão inválida ou expirada. Entre novamente.');
  }
}

/**
 * Reuso de um refresh já rotacionado.
 *
 * Indício de roubo de token: quem apresenta um refresh já substituído ou está
 * com uma cópia antiga, ou interceptou a original. A resposta é revogar toda a
 * cadeia daquele usuário (ADR-0005).
 *
 * Tem código próprio, separado de `InvalidRefreshTokenError`, porque o cliente
 * precisa distinguir "sua sessão expirou" de "detectamos algo errado e
 * encerramos todas as suas sessões".
 */
export class RefreshTokenReusedError extends DomainError {
  override readonly code = ErrorCode.REFRESH_TOKEN_REUSED;
  override readonly httpStatus = HttpStatus.UNAUTHORIZED;

  constructor() {
    super('Sessão encerrada por segurança. Entre novamente.');
  }
}

/** Papel sem permissão para a ação. Lançado pelo `RolesGuard`. */
export class ForbiddenRoleError extends DomainError {
  override readonly code = ErrorCode.FORBIDDEN_ROLE;
  override readonly httpStatus = HttpStatus.FORBIDDEN;

  constructor() {
    super('Seu perfil não permite executar esta ação.');
  }
}
