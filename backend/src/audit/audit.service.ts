import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { v7 as uuidv7 } from 'uuid';
import { toAuditSnapshot } from '../common/utils/redact';
import { PrismaService } from '../prisma/prisma.service';
import { currentAuditContext } from './audit-context';

/**
 * Ações registradas no log.
 *
 * Lista fechada em vez de string livre: o relatório de auditoria precisa
 * agrupar por ação, e texto livre vira três grafias da mesma coisa em um mês.
 */
export const AuditAction = {
  LOGIN_SUCCESS: 'LOGIN_SUCCESS',
  LOGIN_FAILED: 'LOGIN_FAILED',
  LOGOUT: 'LOGOUT',
  REFRESH_REUSE_DETECTED: 'REFRESH_REUSE_DETECTED',

  USER_CREATED: 'USER_CREATED',
  USER_UPDATED: 'USER_UPDATED',
  USER_ROLE_CHANGED: 'USER_ROLE_CHANGED',
  USER_STATUS_CHANGED: 'USER_STATUS_CHANGED',
  USER_PASSWORD_CHANGED: 'USER_PASSWORD_CHANGED',

  CATEGORY_CREATED: 'CATEGORY_CREATED',
  CATEGORY_UPDATED: 'CATEGORY_UPDATED',
  CATEGORY_STATUS_CHANGED: 'CATEGORY_STATUS_CHANGED',

  SUPPLIER_CREATED: 'SUPPLIER_CREATED',
  SUPPLIER_UPDATED: 'SUPPLIER_UPDATED',
  SUPPLIER_STATUS_CHANGED: 'SUPPLIER_STATUS_CHANGED',

  PRODUCT_CREATED: 'PRODUCT_CREATED',
  PRODUCT_UPDATED: 'PRODUCT_UPDATED',
  PRODUCT_STATUS_CHANGED: 'PRODUCT_STATUS_CHANGED',
} as const;

export type AuditAction = (typeof AuditAction)[keyof typeof AuditAction];

export interface RecordAuditInput {
  action: AuditAction;
  entity?: string | undefined;
  entityId?: string | undefined;
  before?: unknown;
  after?: unknown;
  /** Sobrescreve o e-mail do contexto. Usado em login, que falha sem usuário. */
  actorEmail?: string | undefined;
  /** Sobrescreve o autor. Usado em login, antes de a sessão existir. */
  actorId?: string | undefined;
}

@Injectable()
export class AuditService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(AuditService.name);
  }

  /**
   * Registra uma ação no log de auditoria.
   *
   * **Nunca lança.** Uma falha ao gravar o log não pode desfazer a operação
   * que acabou de ser concluída com sucesso: o usuário teria a ação revertida
   * por um problema de registro. A falha vai para o log da aplicação, onde
   * aparece no monitoramento.
   *
   * O estado anterior e posterior passam pela função de redação antes de
   * chegar ao banco. Senha, hash, token e segredo nunca entram aqui
   * (docs/04-banco-de-dados.md §4.4), e isso é garantido em um ponto só.
   */
  async record(input: RecordAuditInput): Promise<void> {
    const context = currentAuditContext();

    const actorId = input.actorId ?? context.actorId;
    const actorEmail = input.actorEmail ?? context.actorEmail;

    try {
      await this.prisma.auditLog.create({
        data: {
          id: uuidv7(),
          action: input.action,
          ...(actorId !== undefined ? { userId: actorId } : {}),
          ...(actorEmail !== undefined ? { actorEmail } : {}),
          ...(input.entity !== undefined ? { entity: input.entity } : {}),
          ...(input.entityId !== undefined ? { entityId: input.entityId } : {}),
          ...(toAuditSnapshot(input.before) !== undefined
            ? { before: toAuditSnapshot(input.before) as object }
            : {}),
          ...(toAuditSnapshot(input.after) !== undefined
            ? { after: toAuditSnapshot(input.after) as object }
            : {}),
          ...(context.ip !== undefined ? { ip: context.ip } : {}),
          ...(context.userAgent !== undefined ? { userAgent: context.userAgent } : {}),
        },
      });
    } catch (error) {
      this.logger.error(
        { err: error, action: input.action, entity: input.entity },
        'falha ao gravar registro de auditoria',
      );
    }
  }
}
