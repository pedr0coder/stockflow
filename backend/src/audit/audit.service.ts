import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { v7 as uuidv7 } from 'uuid';
import { Prisma } from '../generated/prisma/client';
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

  // Fase 5, marco 5A.
  STOCK_MOVEMENT_CREATED: 'STOCK_MOVEMENT_CREATED',

  // Fase 5, marco 5B.
  INVENTORY_OPENED: 'INVENTORY_OPENED',
  INVENTORY_COUNT_RECORDED: 'INVENTORY_COUNT_RECORDED',
  INVENTORY_SUBMITTED: 'INVENTORY_SUBMITTED',
  INVENTORY_APPROVED: 'INVENTORY_APPROVED',
  INVENTORY_CANCELLED: 'INVENTORY_CANCELLED',
} as const;

export type AuditAction = (typeof AuditAction)[keyof typeof AuditAction];

/**
 * Ações de estoque e inventário (Fase 5) que exigem atomicidade estrita junto
 * da mutação de saldo/estado (`recordInTransaction`). Jamais podem ser
 * passadas ao método best-effort `record()` (Marco 7B / S11).
 */
export const TRANSACTIONAL_AUDIT_ACTIONS = [
  AuditAction.STOCK_MOVEMENT_CREATED,
  AuditAction.INVENTORY_OPENED,
  AuditAction.INVENTORY_COUNT_RECORDED,
  AuditAction.INVENTORY_SUBMITTED,
  AuditAction.INVENTORY_APPROVED,
  AuditAction.INVENTORY_CANCELLED,
] as const;

export type TransactionalAuditAction = (typeof TRANSACTIONAL_AUDIT_ACTIONS)[number];
export type BestEffortAuditAction = Exclude<AuditAction, TransactionalAuditAction>;

const TRANSACTIONAL_ACTION_SET: ReadonlySet<string> = new Set(TRANSACTIONAL_AUDIT_ACTIONS);

export interface RecordAuditInput<TAction extends AuditAction = AuditAction> {
  action: TAction;
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
   * Usado pelos cadastros (Fase 4). **Comportamento inalterado** pela Fase 5:
   * continua fora de transação e continua engolindo a falha
   * (docs/17-plano-fase-5.md §17.7.3, decisão D3).
   */
  async record(input: RecordAuditInput<BestEffortAuditAction>): Promise<void> {
    if (TRANSACTIONAL_ACTION_SET.has(input.action)) {
      throw new Error(
        `record: a ação ${String(input.action)} exige transação; use recordInTransaction(tx, ...).`,
      );
    }

    try {
      await this.prisma.auditLog.create({ data: this.buildAuditData(input) });
    } catch (error) {
      this.logger.error(
        { err: error, action: input.action, entity: input.entity },
        'falha ao gravar registro de auditoria',
      );
    }
  }

  /**
   * Registra uma ação **dentro** da transação de negócio, e participa dela.
   *
   * Ao contrário de `record()`, **esta função PROPAGA a falha**: se o
   * `INSERT` do log falhar, a exceção sobe e desfaz também o saldo e o
   * movimento que a mesma transação gravou. É a troca deliberada de
   * disponibilidade por integridade das operações de estoque
   * (docs/17-plano-fase-5.md §17.7.3, decisão D3) — e vale só para quem chama
   * este método, nunca para `record()`, que os cadastros da Fase 4 continuam
   * usando sem mudança de comportamento.
   *
   * Exige autor explícito (no `input` ou no contexto da requisição). Uma
   * operação crítica de estoque sem responsável é erro de ligação do código,
   * não um registro anônimo — por isso lança, em vez de gravar sem autor.
   */
  async recordInTransaction(tx: Prisma.TransactionClient, input: RecordAuditInput): Promise<void> {
    const data = this.buildAuditData(input);

    if (data.userId === undefined) {
      throw new Error(
        `recordInTransaction: autor obrigatório, ausente para a ação ${input.action}.`,
      );
    }

    await tx.auditLog.create({ data });
  }

  /**
   * Monta o registro a partir do input e do contexto da requisição.
   *
   * **Único** ponto que chama `toAuditSnapshot` (a redação): os dois métodos
   * acima o usam, então a redação de campo sensível não pode divergir entre
   * o caminho transacional e o não transacional.
   */
  private buildAuditData(input: RecordAuditInput) {
    const context = currentAuditContext();

    const actorId = input.actorId ?? context.actorId;
    const actorEmail = input.actorEmail ?? context.actorEmail;
    const before = toAuditSnapshot(input.before);
    const after = toAuditSnapshot(input.after);

    return {
      id: uuidv7(),
      action: input.action,
      ...(actorId !== undefined ? { userId: actorId } : {}),
      ...(actorEmail !== undefined ? { actorEmail } : {}),
      ...(input.entity !== undefined ? { entity: input.entity } : {}),
      ...(input.entityId !== undefined ? { entityId: input.entityId } : {}),
      ...(before !== undefined ? { before: before as object } : {}),
      ...(after !== undefined ? { after: after as object } : {}),
      ...(context.ip !== undefined ? { ip: context.ip } : {}),
      ...(context.userAgent !== undefined ? { userAgent: context.userAgent } : {}),
    };
  }
}
