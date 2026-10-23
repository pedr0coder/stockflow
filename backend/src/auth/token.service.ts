import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomBytes } from 'node:crypto';
import { v7 as uuidv7 } from 'uuid';
import { AuditAction, AuditService } from '../audit/audit.service';
import { EnvironmentVariables } from '../config/env.validation';
import { PrismaService } from '../prisma/prisma.service';
import { InvalidRefreshTokenError, RefreshTokenReusedError } from '../common/errors/auth.errors';
import type { UserRole } from '../generated/prisma/enums';

/**
 * Tamanho do refresh token em bytes antes da codificação.
 *
 * 48 bytes dão 384 bits de entropia, bem acima do necessário para tornar a
 * adivinhação inviável. O token é opaco de propósito: ao contrário do access,
 * ele não carrega informação nenhuma, serve só para localizar o registro.
 */
const REFRESH_TOKEN_BYTES = 48;

/** Payload do access token. Ver ADR-0005 para o que **não** está aqui. */
export interface AccessTokenPayload {
  /** Id do usuário. */
  sub: string;
  role: UserRole;
  /** Id do próprio token, para correlacionar com o log. */
  jti: string;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  refreshExpiresAt: Date;
}

interface RotationRow {
  user_id: string;
}

/**
 * Emissão, rotação e revogação de tokens.
 *
 * Separado do `AuthService` porque é a peça com a regra mais delicada da fase,
 * e porque ela é testável sem HTTP e sem senha: dado um token, o que acontece.
 */
@Injectable()
export class TokenService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService<EnvironmentVariables, true>,
    private readonly audit: AuditService,
  ) {}

  /**
   * Hash do refresh token.
   *
   * SHA-256 e não Argon2: o token já tem 384 bits de entropia aleatória, então
   * não há o que um ataque de dicionário faça contra ele. Argon2 aqui custaria
   * 19 MiB e dezenas de milissegundos por requisição de refresh, sem ganho.
   *
   * Isso é diferente de senha, que é escolhida por humano e tem entropia baixa.
   */
  hashRefreshToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  /** Assina o access token com o segredo e o prazo de access. */
  signAccessToken(userId: string, role: UserRole): { token: string; tokenId: string } {
    const tokenId = uuidv7();

    const payload: AccessTokenPayload = { sub: userId, role, jti: tokenId };

    const token = this.jwt.sign(payload, {
      secret: this.config.get('JWT_SECRET', { infer: true }),
      expiresIn: this.config.get('JWT_ACCESS_TTL', { infer: true }),
    });

    return { token, tokenId };
  }

  /**
   * Emite um par novo e grava o refresh.
   *
   * `replacesTokenId` liga este registro ao anterior quando a emissão vem de
   * uma rotação. Em login, fica ausente.
   */
  async issuePair(
    userId: string,
    role: UserRole,
    context: { ip?: string | undefined; userAgent?: string | undefined } = {},
  ): Promise<TokenPair> {
    const { token: accessToken } = this.signAccessToken(userId, role);

    const refreshToken = randomBytes(REFRESH_TOKEN_BYTES).toString('base64url');
    const refreshExpiresAt = this.refreshExpiration();

    await this.prisma.refreshToken.create({
      data: {
        id: uuidv7(),
        userId,
        // Apenas o hash é persistido: vazamento do dump não entrega sessões
        // ativas (ADR-0005).
        tokenHash: this.hashRefreshToken(refreshToken),
        expiresAt: refreshExpiresAt,
        ...(context.ip !== undefined ? { ip: context.ip } : {}),
        ...(context.userAgent !== undefined ? { userAgent: context.userAgent } : {}),
      },
    });

    return { accessToken, refreshToken, refreshExpiresAt };
  }

  /**
   * Consome um refresh token e emite um par novo.
   *
   * ┌────────────────────────────────────────────────────────────────────────┐
   * │ A verificação e a revogação acontecem na MESMA instrução SQL.          │
   * │                                                                        │
   * │ Ler o registro, conferir se está revogado e depois gravar seria o      │
   * │ mesmo lost update que o ADR-0003 descreve para estoque: duas           │
   * │ requisições simultâneas com o mesmo token leriam "não revogado", as    │
   * │ duas passariam, e duas cadeias de sessão nasceriam do mesmo token.     │
   * │                                                                        │
   * │ Com o UPDATE condicional, exatamente uma requisição recebe 1 linha e   │
   * │ é a única autorizada a emitir. As demais recebem 0 linhas.             │
   * └────────────────────────────────────────────────────────────────────────┘
   *
   * Zero linhas significa: token inexistente, já revogado ou expirado. Se o
   * token **existe** e já estava revogado, é indício de roubo, e a resposta é
   * revogar toda a cadeia do usuário.
   */
  async rotate(
    presentedToken: string,
    context: { ip?: string | undefined; userAgent?: string | undefined } = {},
  ): Promise<{ userId: string; pair: TokenPair }> {
    const tokenHash = this.hashRefreshToken(presentedToken);
    const newTokenId = uuidv7();
    const refreshToken = randomBytes(REFRESH_TOKEN_BYTES).toString('base64url');
    const refreshExpiresAt = this.refreshExpiration();

    /**
     * A revogação do antigo e a criação do novo ficam na MESMA transação.
     *
     * Não é só atomicidade: é ordenação. Criar o registro novo depois do
     * commit abriria uma janela em que a requisição perdedora já detectou o
     * reuso e revogou a cadeia, e só então o vencedor insere o token novo,
     * que nasceria ativo apesar de a cadeia ter caído.
     *
     * Isso aconteceu de verdade e foi pego pelo teste de concorrência. Com o
     * insert dentro da transação, a perdedora fica bloqueada no lock da linha
     * até o commit, e quando revoga a cadeia o token novo já está visível.
     */
    const outcome = await this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<RotationRow[]>`
        UPDATE refresh_tokens
           SET revoked_at = now(), replaced_by_id = ${newTokenId}::uuid
         WHERE token_hash = ${tokenHash}
           AND revoked_at IS NULL
           AND expires_at > now()
        RETURNING user_id
      `;

      const row = rows[0];

      if (!row) {
        // Não ganhou a corrida. O motivo é descoberto fora da transação, para
        // que a consulta de diagnóstico não prenda o lock.
        return null;
      }

      const user = await tx.user.findUnique({
        where: { id: row.user_id },
        select: { id: true, role: true, isActive: true },
      });

      if (!user?.isActive) {
        // Usuário inativado depois de obter o refresh não renova. É esta
        // verificação que torna a inativação efetiva sem custar uma consulta
        // ao banco por requisição (docs/15-plano-fase-4.md §15.5).
        return { userId: row.user_id, inactive: true as const };
      }

      await tx.refreshToken.create({
        data: {
          id: newTokenId,
          userId: user.id,
          tokenHash: this.hashRefreshToken(refreshToken),
          expiresAt: refreshExpiresAt,
          ...(context.ip !== undefined ? { ip: context.ip } : {}),
          ...(context.userAgent !== undefined ? { userAgent: context.userAgent } : {}),
        },
      });

      return { userId: user.id, role: user.role, inactive: false as const };
    });

    if (outcome === null) {
      await this.handleFailedRotation(tokenHash);
      throw new InvalidRefreshTokenError();
    }

    if (outcome.inactive) {
      await this.revokeAllForUser(outcome.userId);
      throw new InvalidRefreshTokenError();
    }

    const { token: accessToken } = this.signAccessToken(outcome.userId, outcome.role);

    return {
      userId: outcome.userId,
      pair: { accessToken, refreshToken, refreshExpiresAt },
    };
  }

  /** Revoga um refresh específico. Usado no logout. */
  async revoke(presentedToken: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash: this.hashRefreshToken(presentedToken), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  /**
   * Revoga todos os refresh ativos de um usuário.
   *
   * Usado em três situações: detecção de reuso, alteração de papel e
   * inativação. Nas duas últimas, encerra a capacidade de **renovar**; o access
   * já emitido continua válido até expirar, por até 15 minutos. Essa distinção
   * está detalhada em docs/15-plano-fase-4.md §15.5.
   */
  async revokeAllForUser(userId: string): Promise<number> {
    const result = await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    return result.count;
  }

  /**
   * Decide o motivo de a rotação ter falhado.
   *
   * Se o token existe mas já estava revogado, alguém apresentou um refresh
   * que já foi usado. Pode ser a aba que perdeu a corrida, pode ser um token
   * roubado, e não há como distinguir. A política é tratar como roubo e
   * derrubar a cadeia: preferimos o falso positivo ao falso negativo.
   */
  private async handleFailedRotation(tokenHash: string): Promise<void> {
    const existing = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      select: { userId: true, revokedAt: true },
    });

    if (existing?.revokedAt) {
      const revogados = await this.revokeAllForUser(existing.userId);

      /**
       * O evento mais sensível do modelo de tokens, e por isso ele é
       * auditado aqui.
       *
       * `REFRESH_REUSE_DETECTED` estava na lista de ações desde o começo e
       * nada o emitia: a detecção derrubava todas as sessões do usuário e não
       * deixava rastro nenhum. Quem investigasse um incidente veria as sessões
       * caírem sem motivo registrado. Foi o teste de auditoria que expôs isso.
       *
       * O registro vai aqui, e não no controller, porque é aqui que se sabe
       * de QUEM era o token: quem apresentou o refresh roubado não está
       * autenticado, então o contexto da requisição não tem autor.
       *
       * Sem hash e sem token no registro: só o usuário afetado e quantas
       * sessões foram encerradas.
       */
      await this.audit.record({
        action: AuditAction.REFRESH_REUSE_DETECTED,
        actorId: existing.userId,
        entity: 'User',
        entityId: existing.userId,
        after: { revokedSessions: revogados },
      });

      throw new RefreshTokenReusedError();
    }
  }

  /**
   * Converte o prazo configurado em data de expiração.
   *
   * Aceita a mesma notação do JWT (`7d`, `12h`, `30m`), para que a
   * configuração seja uma só entre o token e o registro no banco.
   */
  private refreshExpiration(): Date {
    const ttl = this.config.get('JWT_REFRESH_TTL', { infer: true });
    return new Date(Date.now() + parseDuration(ttl));
  }
}

/** Converte `7d`, `12h`, `30m` ou `45s` em milissegundos. */
export function parseDuration(value: string): number {
  const match = /^(\d+)([smhd])$/.exec(value.trim());

  if (!match) {
    throw new Error(`Duração inválida: "${value}". Use o formato 15m, 12h ou 7d.`);
  }

  const amount = Number.parseInt(match[1] ?? '0', 10);

  const unit: Record<string, number> = {
    s: 1000,
    m: 60 * 1000,
    h: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000,
  };

  return amount * (unit[match[2] ?? 's'] ?? 1000);
}
