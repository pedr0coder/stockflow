import { describe, expect, it, vi } from 'vitest';
import {
  AuditAction,
  AuditService,
  TRANSACTIONAL_AUDIT_ACTIONS,
  type BestEffortAuditAction,
} from './audit.service';

function makeService(createImpl: () => Promise<unknown>) {
  const auditLogCreate = vi.fn(createImpl);
  const prisma = { auditLog: { create: auditLogCreate } };
  const logger = { setContext: vi.fn(), error: vi.fn() };
  const service = new AuditService(prisma as never, logger as never);

  return { service, auditLogCreate, logger };
}

/**
 * `record()` (cadastros, Fase 4) e `recordInTransaction()` (estoque, Fase 5)
 * precisam ter comportamentos de falha OPOSTOS, de propósito
 * (docs/17-plano-fase-5.md §17.7.3, decisão D3): o primeiro nunca pode
 * desfazer uma operação já concluída; o segundo precisa desfazer, porque uma
 * movimentação de estoque sem auditoria não deve existir.
 */
describe('AuditService', () => {
  describe('record (RG-4: continua engolindo a falha — Fase 4 inalterada)', () => {
    it('não lança quando o INSERT falha, e registra no log da aplicação', async () => {
      const falha = new Error('falha de banco simulada');
      const { service, logger } = makeService(() => Promise.reject(falha));

      await expect(
        service.record({ action: AuditAction.PRODUCT_CREATED, actorId: 'u1' }),
      ).resolves.toBeUndefined();

      expect(logger.error).toHaveBeenCalledTimes(1);
      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({ err: falha, action: AuditAction.PRODUCT_CREATED }),
        'falha ao gravar registro de auditoria',
      );
    });

    it('grava normalmente quando não há falha', async () => {
      const { service, auditLogCreate } = makeService(() => Promise.resolve({}));

      await service.record({ action: AuditAction.PRODUCT_CREATED, actorId: 'u1' });

      expect(auditLogCreate).toHaveBeenCalledTimes(1);
    });

    it.each(TRANSACTIONAL_AUDIT_ACTIONS)(
      'recusa em runtime a ação transacional %s caso a checagem de tipo seja contornada (S11)',
      async (action) => {
        const { service, auditLogCreate, logger } = makeService(() => Promise.resolve({}));

        await expect(
          service.record({
            action: action as unknown as BestEffortAuditAction,
            actorId: 'u1',
          }),
        ).rejects.toThrow(/exige transação; use recordInTransaction/);

        expect(auditLogCreate).not.toHaveBeenCalled();
        expect(logger.error).not.toHaveBeenCalled();
      },
    );
  });

  describe('recordInTransaction (RG-5: propaga a falha, para a transação desfazer)', () => {
    it('lança quando o INSERT falha', async () => {
      const falha = new Error('falha de banco simulada');
      const { service } = makeService(() => Promise.reject(falha));
      const tx = { auditLog: { create: vi.fn((_data: unknown) => Promise.reject(falha)) } };

      await expect(
        service.recordInTransaction(tx as never, {
          action: AuditAction.STOCK_MOVEMENT_CREATED,
          actorId: 'u1',
        }),
      ).rejects.toThrow(falha);
    });

    it('exige autor: lança erro próprio quando não há actorId nem contexto', async () => {
      const { service } = makeService(() => Promise.resolve({}));
      const tx = { auditLog: { create: vi.fn((_data: unknown) => Promise.resolve({})) } };

      await expect(
        service.recordInTransaction(tx as never, { action: AuditAction.STOCK_MOVEMENT_CREATED }),
      ).rejects.toThrow(/autor obrigatório/);

      expect(tx.auditLog.create).not.toHaveBeenCalled();
    });

    it('grava usando o cliente da TRANSAÇÃO, não o cliente global', async () => {
      const { service, auditLogCreate } = makeService(() => Promise.resolve({}));
      const txCreate = vi.fn((_data: unknown) => Promise.resolve({}));
      const tx = { auditLog: { create: txCreate } };

      await service.recordInTransaction(tx as never, {
        action: AuditAction.STOCK_MOVEMENT_CREATED,
        actorId: 'u1',
        entity: 'StockMovement',
        entityId: 'm1',
      });

      expect(txCreate).toHaveBeenCalledTimes(1);
      expect(auditLogCreate).not.toHaveBeenCalled();
    });
  });

  describe('RG-7: a redação é a MESMA para os dois caminhos', () => {
    it('passwordHash não chega ao registro gravado por recordInTransaction', async () => {
      const { service } = makeService(() => Promise.resolve({}));
      const txCreate = vi.fn((_data: unknown) => Promise.resolve({}));
      const tx = { auditLog: { create: txCreate } };

      await service.recordInTransaction(tx as never, {
        action: AuditAction.STOCK_MOVEMENT_CREATED,
        actorId: 'u1',
        after: { quantity: '5.000', passwordHash: 'segredo-que-nao-deveria-estar-aqui' },
      });

      const dataGravada = txCreate.mock.calls[0]?.[0] as { data: { after?: unknown } };

      expect(JSON.stringify(dataGravada.data.after)).not.toContain(
        'segredo-que-nao-deveria-estar-aqui',
      );
    });
  });
});
