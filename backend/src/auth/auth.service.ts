import { Injectable } from '@nestjs/common';
import { hash, verify } from '@node-rs/argon2';
import { PinoLogger } from 'nestjs-pino';
import { AuditAction, AuditService } from '../audit/audit.service';
import { InvalidCredentialsError, UserInactiveError } from '../common/errors/auth.errors';
import { PrismaService } from '../prisma/prisma.service';
import { TokenService, type TokenPair } from './token.service';
import type { AuthUserDto } from './dto/auth-response.dto';

/**
 * Parâmetros do Argon2id, mínimos da OWASP (docs/08-seguranca.md §8.1).
 *
 * Os mesmos usados pelo seed. Quando o módulo de usuários criar senha, usa
 * estes também: um lugar só define o custo.
 */
export const ARGON2_OPTIONS = { memoryCost: 19_456, timeCost: 2, parallelism: 1 } as const;

/**
 * Hash descartável usado quando o e-mail não existe.
 *
 * Sem ele, a resposta para e-mail inexistente voltaria sem passar por Argon2id,
 * e a diferença de tempo revelaria quais contas existem. Verificar contra um
 * hash válido qualquer faz o custo ficar comparável.
 *
 * É mitigação **parcial**, e está declarada como tal: equalização perfeita de
 * tempo não é alcançável em Node, e o atacante ainda tem outros sinais.
 */
const DUMMY_HASH =
  '$argon2id$v=19$m=19456,t=2,p=1$c2FsdGVkc2FsdGVkc2E$5nQ1z8pV0u1v3wXyZaBcDeFgHiJkLmNoPqRsTuVwXyZ';

export interface LoginContext {
  ip?: string | undefined;
  userAgent?: string | undefined;
}

export interface LoginResult {
  pair: TokenPair;
  user: AuthUserDto;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: TokenService,
    private readonly audit: AuditService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(AuthService.name);
  }

  /** Gera o hash de uma senha. Usado aqui e pelo módulo de usuários. */
  static hashPassword(plain: string): Promise<string> {
    return hash(plain, ARGON2_OPTIONS);
  }

  /**
   * Autentica e emite o par de tokens.
   *
   * A ordem das verificações importa. Credencial errada e e-mail inexistente
   * produzem a **mesma** resposta, porque distinguir permitiria enumerar
   * contas. A conta desativada só é revelada a quem já provou conhecer a
   * senha, que é informação que o próprio titular precisa.
   */
  async login(email: string, password: string, context: LoginContext = {}): Promise<LoginResult> {
    const normalizedEmail = email.trim().toLowerCase();

    const user = await this.prisma.user.findUnique({
      where: { email: normalizedEmail },
      // Opt-in explícito: o `passwordHash` é omitido globalmente na
      // configuração do cliente, e este é o único lugar do sistema que o pede.
      omit: { passwordHash: false },
    });

    const passwordMatches = await verify(user?.passwordHash ?? DUMMY_HASH, password).catch(
      () => false,
    );

    if (!user || !passwordMatches) {
      // O e-mail tentado é preservado mesmo sem usuário: é o único dado que
      // permite investigar uma sequência de tentativas (docs/04 §4.4).
      await this.audit.record({
        action: AuditAction.LOGIN_FAILED,
        actorEmail: normalizedEmail,
        ...(user?.id !== undefined ? { actorId: user.id } : {}),
      });

      throw new InvalidCredentialsError();
    }

    if (!user.isActive) {
      await this.audit.record({
        action: AuditAction.LOGIN_FAILED,
        actorId: user.id,
        actorEmail: normalizedEmail,
        after: { reason: 'USER_INACTIVE' },
      });

      throw new UserInactiveError();
    }

    const pair = await this.tokens.issuePair(user.id, user.role, context);

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    await this.audit.record({
      action: AuditAction.LOGIN_SUCCESS,
      actorId: user.id,
      actorEmail: user.email,
      entity: 'User',
      entityId: user.id,
    });

    return {
      pair,
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
    };
  }

  /** Rotaciona o refresh e emite um par novo. */
  async refresh(presentedToken: string, context: LoginContext = {}): Promise<LoginResult> {
    const { userId, pair } = await this.tokens.rotate(presentedToken, context);

    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { id: true, name: true, email: true, role: true },
    });

    return { pair, user };
  }

  /** Revoga o refresh apresentado. Idempotente de propósito. */
  async logout(presentedToken: string | undefined): Promise<void> {
    if (!presentedToken) {
      return;
    }

    await this.tokens.revoke(presentedToken);
    await this.audit.record({ action: AuditAction.LOGOUT });
  }

  /** Dados do usuário autenticado, a partir do id do token. */
  async me(userId: string): Promise<AuthUserDto> {
    return this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { id: true, name: true, email: true, role: true },
    });
  }
}
