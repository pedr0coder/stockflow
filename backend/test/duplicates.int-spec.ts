import { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PrismaService } from '../src/prisma/prisma.service';
import { UserRole } from '../src/generated/prisma/enums';
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
 * ┌────────────────────────────────────────────────────────────────────────────┐
 * │ CARACTERIZAÇÃO, NÃO PREVENÇÃO (docs/17-plano-fase-5.md §17.7.5, decisão    │
 * │ D14, risco aceito RA-1).                                                   │
 * │                                                                            │
 * │ Não existe chave de idempotência nesta fase. Estes testes PROVAM o que o  │
 * │ backend garante (saldo nunca negativo, máquina de estados do inventário)  │
 * │ e DOCUMENTAM, sem disfarçar, o que ele NÃO evita: duas requisições         │
 * │ idênticas de entrada ou saída viram dois movimentos. Desabilitar o botão  │
 * │ no frontend é conveniência de UI, não garantia — a prova disso é que      │
 * │ estes testes chamam a API direto, sem UI nenhuma no caminho.              │
 * └────────────────────────────────────────────────────────────────────────────┘
 */
describe('Requisições duplicadas (integração)', () => {
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
    await assertStockInvariants(prisma);
  });

  it('DUP-1: POST /in idêntica duas vezes em SEQUÊNCIA aplica as DUAS', async () => {
    const p = await createProduct(prisma, categoryId, { currentStock: '0.000' });
    const corpo = { productId: p.id, quantity: '5.000', reason: 'PURCHASE' as const };

    const r1 = await request(app.getHttpServer())
      .post('/api/v1/stock-movements/in')
      .set('Authorization', bearer(operator))
      .send(corpo);
    const r2 = await request(app.getHttpServer())
      .post('/api/v1/stock-movements/in')
      .set('Authorization', bearer(operator))
      .send(corpo);

    expect(r1.status).toBe(201);
    expect(r2.status).toBe(201);
    expect(r1.body.id).not.toBe(r2.body.id);

    const produto = await prisma.product.findUniqueOrThrow({ where: { id: p.id } });
    expect(produto.currentStock.toString()).toBe('10');
    expect(await prisma.stockMovement.count({ where: { productId: p.id } })).toBe(2);
  });

  it('DUP-2: POST /out idêntica duas vezes aplica as DUAS, se houver saldo para as duas', async () => {
    const p = await createProduct(prisma, categoryId, { currentStock: '10.000' });
    const corpo = { productId: p.id, quantity: '3.000', reason: 'SALE' as const };

    const r1 = await request(app.getHttpServer())
      .post('/api/v1/stock-movements/out')
      .set('Authorization', bearer(operator))
      .send(corpo);
    const r2 = await request(app.getHttpServer())
      .post('/api/v1/stock-movements/out')
      .set('Authorization', bearer(operator))
      .send(corpo);

    expect(r1.status).toBe(201);
    expect(r2.status).toBe(201);

    const produto = await prisma.product.findUniqueOrThrow({ where: { id: p.id } });
    expect(produto.currentStock.toString()).toBe('4');
  });

  it('DUP-3: N saídas idênticas simultâneas aplicam no máximo floor(saldo/quantidade), saldo NUNCA negativo', async () => {
    const p = await createProduct(prisma, categoryId, { currentStock: '10.000' });
    const corpo = { productId: p.id, quantity: '3.000', reason: 'SALE' as const };

    const respostas = await Promise.all(
      Array.from({ length: 5 }, () =>
        request(app.getHttpServer())
          .post('/api/v1/stock-movements/out')
          .set('Authorization', bearer(operator))
          .send(corpo),
      ),
    );

    const sucessos = respostas.filter((r) => r.status === 201);
    // floor(10/3) = 3.
    expect(sucessos).toHaveLength(3);

    const produto = await prisma.product.findUniqueOrThrow({ where: { id: p.id } });
    expect(Number(produto.currentStock)).toBeGreaterThanOrEqual(0);
    expect(produto.currentStock.toString()).toBe('1');
  });

  it('DUP-4: o mesmo ajuste manual duas vezes — a SEGUNDA é 422 (sem efeito), idempotência natural', async () => {
    const p = await createProduct(prisma, categoryId, { currentStock: '10.000' });
    const corpo = {
      productId: p.id,
      finalQuantity: '6.000',
      reason: 'CORRECTION' as const,
      note: 'Recontagem',
    };

    const r1 = await request(app.getHttpServer())
      .post('/api/v1/stock-movements/adjustment')
      .set('Authorization', bearer(admin))
      .send(corpo);
    const r2 = await request(app.getHttpServer())
      .post('/api/v1/stock-movements/adjustment')
      .set('Authorization', bearer(admin))
      .send(corpo);

    expect(r1.status).toBe(201);
    expect(r2.status).toBe(422);
    expect(await prisma.stockMovement.count({ where: { productId: p.id } })).toBe(1);

    const produto = await prisma.product.findUniqueOrThrow({ where: { id: p.id } });
    expect(produto.currentStock.toString()).toBe('6');
  });

  it('DUP-5: reenvio depois de a resposta se perder (socket abortado pelo cliente) ainda DUPLICA', async () => {
    const p = await createProduct(prisma, categoryId, { currentStock: '0.000' });
    const corpo = { productId: p.id, quantity: '4.000', reason: 'PURCHASE' as const };

    // Simula "o cliente nunca viu a resposta": a requisição é enviada e
    // concluída no servidor normalmente (o servidor não tem como saber que o
    // cliente a daria por perdida), e o cliente, não tendo recebido
    // confirmação, reenvia.
    const primeiraTentativa = await request(app.getHttpServer())
      .post('/api/v1/stock-movements/in')
      .set('Authorization', bearer(operator))
      .send(corpo);
    expect(primeiraTentativa.status).toBe(201);

    const reenvio = await request(app.getHttpServer())
      .post('/api/v1/stock-movements/in')
      .set('Authorization', bearer(operator))
      .send(corpo);
    expect(reenvio.status).toBe(201);

    // O servidor não tem como distinguir "reenvio por perda de resposta" de
    // "uma segunda entrada legítima": as DUAS existem.
    expect(await prisma.stockMovement.count({ where: { productId: p.id } })).toBe(2);
    const produto = await prisma.product.findUniqueOrThrow({ where: { id: p.id } });
    expect(produto.currentStock.toString()).toBe('8');
  });

  it('a trilha de auditoria permite reconstruir uma duplicata depois do fato (mitigação P5)', async () => {
    const p = await createProduct(prisma, categoryId, { currentStock: '0.000' });
    const corpo = {
      productId: p.id,
      quantity: '4.000',
      reason: 'PURCHASE' as const,
      referenceDoc: 'NF-0001',
    };

    await request(app.getHttpServer())
      .post('/api/v1/stock-movements/in')
      .set('Authorization', bearer(operator))
      .send(corpo);
    await request(app.getHttpServer())
      .post('/api/v1/stock-movements/in')
      .set('Authorization', bearer(operator))
      .send(corpo);

    const movimentos = await prisma.stockMovement.findMany({
      where: { productId: p.id },
      orderBy: { createdAt: 'asc' },
    });

    // Mesmo autor, mesmo referenceDoc, mesmo valor — o padrão que uma
    // consulta de detecção manual procuraria.
    expect(movimentos).toHaveLength(2);
    expect(movimentos[0]?.userId).toBe(movimentos[1]?.userId);
    expect(movimentos[0]?.referenceDoc).toBe(movimentos[1]?.referenceDoc);
    expect(movimentos[0]?.quantity.toString()).toBe(movimentos[1]?.quantity.toString());
  });
});
