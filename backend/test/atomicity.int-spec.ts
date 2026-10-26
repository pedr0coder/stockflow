import { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PrismaService } from '../src/prisma/prisma.service';
import { UserRole } from '../src/generated/prisma/enums';
import { removeInsertFailure, withInsertFailure } from './helpers/failure-injection';
import { assertStockInvariants } from './helpers/invariants';
import {
  bearer,
  createCategory,
  createProduct,
  createSession,
  createTestApp,
  truncateAll,
  type Session,
  type TestApp,
} from './helpers/app';

/**
 * Prova de que saldo, movimento e auditoria confirmam JUNTOS ou NENHUM
 * (docs/17-plano-fase-5.md §17.7.4), por injeção de falha REAL no banco — não
 * um mock. AT-9 prova o contrário de propósito: a Fase 4 continua tolerando
 * falha de auditoria sem desfazer a operação (decisão D3).
 */
describe('Atomicidade: saldo, movimento e auditoria (integração)', () => {
  let harness: TestApp;
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let operator: Session;
  let admin: Session;
  let categoryId: string;

  beforeAll(async () => {
    harness = await createTestApp();
    app = harness.app;
    prisma = harness.prisma;
  });

  afterAll(async () => {
    await harness.close();
  });

  beforeEach(async () => {
    await truncateAll(prisma);
    operator = await createSession(app, prisma, UserRole.OPERATOR);
    admin = await createSession(app, prisma, UserRole.ADMIN);
    categoryId = (await createCategory(prisma)).id;
  });

  afterEach(async () => {
    // Salvaguarda: se um caso falhar no meio e não chegar ao `finally` do
    // helper, o trigger de teste não vaza para os casos seguintes.
    await removeInsertFailure(prisma, 'stock_movements');
    await removeInsertFailure(prisma, 'audit_logs');
    await assertStockInvariants(prisma);
  });

  async function snapshot(productId: string) {
    const produto = await prisma.product.findUniqueOrThrow({ where: { id: productId } });
    const movimentos = await prisma.stockMovement.count({ where: { productId } });
    const auditorias = await prisma.auditLog.count({ where: { action: 'STOCK_MOVEMENT_CREATED' } });

    return { saldo: produto.currentStock.toString(), movimentos, auditorias };
  }

  it('AT-1: falha no INSERT do movimento (depois do UPDATE do saldo) não deixa nada', async () => {
    const p = await createProduct(prisma, categoryId, { currentStock: '10.000' });
    const antes = await snapshot(p.id);

    let resposta: { status: number; body: unknown } = { status: 0, body: undefined };

    await withInsertFailure(prisma, 'stock_movements', async () => {
      resposta = await request(app.getHttpServer())
        .post('/api/v1/stock-movements/out')
        .set('Authorization', bearer(operator))
        .send({ productId: p.id, quantity: '3.000', reason: 'SALE' });
    });

    expect(resposta.status).toBe(500);
    // O contrato único de erro, e nenhum detalhe interno vazado.
    const corpo = resposta.body as Record<string, unknown>;
    expect(corpo).toHaveProperty('requestId');
    expect(corpo).toHaveProperty('code');
    expect(JSON.stringify(corpo)).not.toMatch(/stack|node_modules|\.ts:|SELECT|UPDATE/i);

    expect(await snapshot(p.id)).toEqual(antes);
  });

  it('AT-2: falha na AUDITORIA de uma saída não deixa nem o movimento', async () => {
    const p = await createProduct(prisma, categoryId, { currentStock: '10.000' });
    const antes = await snapshot(p.id);

    let resposta: { status: number } = { status: 0 };

    await withInsertFailure(prisma, 'audit_logs', async () => {
      resposta = await request(app.getHttpServer())
        .post('/api/v1/stock-movements/out')
        .set('Authorization', bearer(operator))
        .send({ productId: p.id, quantity: '3.000', reason: 'SALE' });
    });

    expect(resposta.status).toBe(500);
    expect(await snapshot(p.id)).toEqual(antes);
  });

  it('AT-3a: falha na auditoria de uma ENTRADA não deixa nem o movimento', async () => {
    const p = await createProduct(prisma, categoryId, { currentStock: '10.000' });
    const antes = await snapshot(p.id);

    await withInsertFailure(prisma, 'audit_logs', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/stock-movements/in')
        .set('Authorization', bearer(operator))
        .send({ productId: p.id, quantity: '5.000', reason: 'PURCHASE' });
    });

    expect(await snapshot(p.id)).toEqual(antes);
  });

  it('AT-3b: falha na auditoria de um AJUSTE não deixa nem o movimento', async () => {
    const p = await createProduct(prisma, categoryId, { currentStock: '10.000' });
    const antes = await snapshot(p.id);

    await withInsertFailure(prisma, 'audit_logs', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/stock-movements/adjustment')
        .set('Authorization', bearer(admin))
        .send({ productId: p.id, finalQuantity: '2.000', reason: 'CORRECTION', note: 'Tentativa' });
    });

    expect(await snapshot(p.id)).toEqual(antes);
  });

  it('depois de remover a falha, a operação funciona normalmente (não ficou nada travado)', async () => {
    const p = await createProduct(prisma, categoryId, { currentStock: '10.000' });

    await withInsertFailure(prisma, 'stock_movements', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/stock-movements/out')
        .set('Authorization', bearer(operator))
        .send({ productId: p.id, quantity: '3.000', reason: 'SALE' });
    });

    const response = await request(app.getHttpServer())
      .post('/api/v1/stock-movements/out')
      .set('Authorization', bearer(operator))
      .send({ productId: p.id, quantity: '3.000', reason: 'SALE' });

    expect(response.status).toBe(201);
    expect(response.body.stockAfter).toBe('7.000');
  });

  /**
   * AT-9 — o CONTRÁRIO de propósito: a Fase 4 preservada.
   *
   * `record()` (cadastros) continua engolindo a falha da auditoria: a
   * operação CONCLUI com sucesso, sem linha de auditoria. É a prova de
   * regressão da decisão D3 (docs/17-plano-fase-5.md §17.7.3): só
   * `recordInTransaction()` — usado pelas operações de estoque acima —
   * propaga a falha.
   */
  it('AT-9: falha na auditoria de um CADASTRO (Fase 4) NÃO desfaz a operação', async () => {
    let resposta: { status: number; body: unknown } = { status: 0, body: undefined };

    await withInsertFailure(prisma, 'audit_logs', async () => {
      resposta = await request(app.getHttpServer())
        .post('/api/v1/categories')
        .set('Authorization', bearer(admin))
        .send({ name: 'Categoria AT-9' });
    });

    expect(resposta.status).toBe(201);
    const categoria = await prisma.category.findFirstOrThrow({ where: { name: 'Categoria AT-9' } });

    // E nenhuma auditoria foi gravada para esta categoria (a falha foi
    // engolida, exatamente como `record()` sempre se comportou).
    const auditoria = await prisma.auditLog.findFirst({
      where: { action: 'CATEGORY_CREATED', entityId: categoria.id },
    });
    expect(auditoria).toBeNull();
  });
});
