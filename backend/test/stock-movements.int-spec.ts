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
  pageOf,
  truncateAll,
  type Session,
  type TestApp,
} from './helpers/app';

describe('Movimentações de estoque (integração)', () => {
  let harness: TestApp;
  let app: NestExpressApplication;
  let prisma: PrismaService;

  let admin: Session;
  let manager: Session;
  let operator: Session;
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
    admin = await createSession(app, prisma, UserRole.ADMIN);
    manager = await createSession(app, prisma, UserRole.MANAGER);
    operator = await createSession(app, prisma, UserRole.OPERATOR);
    categoryId = (await createCategory(prisma)).id;
  });

  // Roda depois de CADA caso deste arquivo, não só dos de falha
  // (docs/17-plano-fase-5.md §17.7.6).
  afterEach(async () => {
    await assertStockInvariants(prisma);
  });

  async function produto(overrides: Parameters<typeof createProduct>[2] = {}) {
    return createProduct(prisma, categoryId, overrides);
  }

  describe('POST /stock-movements/in', () => {
    it('cria a entrada e atualiza o saldo na mesma transação', async () => {
      const p = await produto({ currentStock: '10.000' });

      const response = await request(app.getHttpServer())
        .post('/api/v1/stock-movements/in')
        .set('Authorization', bearer(operator))
        .send({ productId: p.id, quantity: '5.000', reason: 'PURCHASE' });

      expect(response.status).toBe(201);
      expect(response.body).toMatchObject({
        productId: p.id,
        type: 'IN',
        reason: 'PURCHASE',
        quantity: '5.000',
        stockBefore: '10.000',
        stockAfter: '15.000',
        inventoryItemId: null,
      });
      expect(response.body.user).toMatchObject({ id: operator.user.id });

      const produtoAtualizado = await prisma.product.findUniqueOrThrow({ where: { id: p.id } });
      expect(produtoAtualizado.currentStock.toString()).toBe('15');
    });

    it('registra auditoria STOCK_MOVEMENT_CREATED', async () => {
      const p = await produto({ currentStock: '10.000' });

      const response = await request(app.getHttpServer())
        .post('/api/v1/stock-movements/in')
        .set('Authorization', bearer(operator))
        .send({ productId: p.id, quantity: '5.000', reason: 'PURCHASE' });

      const auditoria = await prisma.auditLog.findFirst({
        where: { action: 'STOCK_MOVEMENT_CREATED', entityId: response.body.id as string },
      });
      expect(auditoria).not.toBeNull();
      expect(auditoria?.userId).toBe(operator.user.id);
    });

    it('produto inativo: 409 PRODUCT_INACTIVE', async () => {
      const p = await produto({ currentStock: '10.000', isActive: false });

      const response = await request(app.getHttpServer())
        .post('/api/v1/stock-movements/in')
        .set('Authorization', bearer(operator))
        .send({ productId: p.id, quantity: '5.000', reason: 'PURCHASE' });

      expect(response.status).toBe(409);
      expect(response.body.code).toBe('PRODUCT_INACTIVE');
      expect(response.body.details).toMatchObject({ productId: p.id });
    });

    it('produto inexistente: 404', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/stock-movements/in')
        .set('Authorization', bearer(operator))
        .send({
          productId: '0199a000-0000-7000-8000-000000000000',
          quantity: '5.000',
          reason: 'PURCHASE',
        });

      expect(response.status).toBe(404);
      expect(response.body.code).toBe('NOT_FOUND');
    });

    it('motivo de saída na entrada: 422 INVALID_TYPE_REASON', async () => {
      const p = await produto();

      const response = await request(app.getHttpServer())
        .post('/api/v1/stock-movements/in')
        .set('Authorization', bearer(operator))
        .send({ productId: p.id, quantity: '5.000', reason: 'SALE' });

      expect(response.status).toBe(422);
      expect(response.body.code).toBe('INVALID_TYPE_REASON');
      expect(response.body.details).toMatchObject({ type: 'IN', reason: 'SALE' });
    });

    it.each(['0', '0.000', '-1', '1.2345', 'abc', ''])(
      'quantidade inválida "%s": 400 VALIDATION_ERROR',
      async (quantity) => {
        const p = await produto();

        const response = await request(app.getHttpServer())
          .post('/api/v1/stock-movements/in')
          .set('Authorization', bearer(operator))
          .send({ productId: p.id, quantity, reason: 'PURCHASE' });

        expect(response.status).toBe(400);
        expect(response.body.code).toBe('VALIDATION_ERROR');
      },
    );

    it.each(['type', 'userId', 'stockBefore', 'stockAfter', 'inventoryItemId', 'createdAt', 'id'])(
      'recusa o campo "%s" no corpo (mass assignment)',
      async (campo) => {
        const p = await produto();

        const response = await request(app.getHttpServer())
          .post('/api/v1/stock-movements/in')
          .set('Authorization', bearer(operator))
          .send({
            productId: p.id,
            quantity: '1.000',
            reason: 'PURCHASE',
            [campo]: 'valor-hostil',
          });

        expect(response.status).toBe(400);
        expect(response.body.code).toBe('VALIDATION_ERROR');
      },
    );

    it('OPERATOR também pode registrar entrada (os três papéis podem)', async () => {
      const p = await produto();

      const response = await request(app.getHttpServer())
        .post('/api/v1/stock-movements/in')
        .set('Authorization', bearer(operator))
        .send({ productId: p.id, quantity: '1.000', reason: 'PURCHASE' });

      expect(response.status).toBe(201);
    });
  });

  describe('POST /stock-movements/out', () => {
    it('saída igual ao saldo é permitida e deixa 0', async () => {
      const p = await produto({ currentStock: '10.000' });

      const response = await request(app.getHttpServer())
        .post('/api/v1/stock-movements/out')
        .set('Authorization', bearer(operator))
        .send({ productId: p.id, quantity: '10.000', reason: 'SALE' });

      expect(response.status).toBe(201);
      expect(response.body.stockAfter).toBe('0.000');
    });

    it('sem saldo suficiente: 409 INSUFFICIENT_STOCK, e nenhuma linha criada', async () => {
      const p = await produto({ currentStock: '5.000' });

      const response = await request(app.getHttpServer())
        .post('/api/v1/stock-movements/out')
        .set('Authorization', bearer(operator))
        .send({ productId: p.id, quantity: '12.500', reason: 'SALE' });

      expect(response.status).toBe(409);
      expect(response.body.code).toBe('INSUFFICIENT_STOCK');
      expect(response.body.details).toMatchObject({
        productId: p.id,
        available: '5.000',
        requested: '12.500',
      });

      expect(await prisma.stockMovement.count()).toBe(0);
      const produtoAtualizado = await prisma.product.findUniqueOrThrow({ where: { id: p.id } });
      expect(produtoAtualizado.currentStock.toString()).toBe('5');
    });

    it('motivo de entrada na saída: 422 INVALID_TYPE_REASON', async () => {
      const p = await produto({ currentStock: '10.000' });

      const response = await request(app.getHttpServer())
        .post('/api/v1/stock-movements/out')
        .set('Authorization', bearer(operator))
        .send({ productId: p.id, quantity: '1.000', reason: 'PURCHASE' });

      expect(response.status).toBe(422);
      expect(response.body.code).toBe('INVALID_TYPE_REASON');
    });

    it('produto inativo: 409 PRODUCT_INACTIVE', async () => {
      const p = await produto({ currentStock: '10.000', isActive: false });

      const response = await request(app.getHttpServer())
        .post('/api/v1/stock-movements/out')
        .set('Authorization', bearer(operator))
        .send({ productId: p.id, quantity: '1.000', reason: 'SALE' });

      expect(response.status).toBe(409);
      expect(response.body.code).toBe('PRODUCT_INACTIVE');
    });
  });

  describe('POST /stock-movements/adjustment', () => {
    it('ADMIN ajusta para a quantidade final, com magnitude e sentido corretos', async () => {
      const p = await produto({ currentStock: '15.000' });

      const response = await request(app.getHttpServer())
        .post('/api/v1/stock-movements/adjustment')
        .set('Authorization', bearer(admin))
        .send({
          productId: p.id,
          finalQuantity: '12.000',
          reason: 'CORRECTION',
          note: 'Recontagem',
        });

      expect(response.status).toBe(201);
      expect(response.body).toMatchObject({
        type: 'ADJUSTMENT',
        reason: 'CORRECTION',
        quantity: '3.000', // magnitude |12 - 15|
        stockBefore: '15.000',
        stockAfter: '12.000',
      });
    });

    it('MANAGER também ajusta', async () => {
      const p = await produto({ currentStock: '15.000' });

      const response = await request(app.getHttpServer())
        .post('/api/v1/stock-movements/adjustment')
        .set('Authorization', bearer(manager))
        .send({
          productId: p.id,
          finalQuantity: '20.000',
          reason: 'CORRECTION',
          note: 'Entrada não lançada',
        });

      expect(response.status).toBe(201);
    });

    it('OPERATOR não ajusta: 403', async () => {
      const p = await produto({ currentStock: '15.000' });

      const response = await request(app.getHttpServer())
        .post('/api/v1/stock-movements/adjustment')
        .set('Authorization', bearer(operator))
        .send({
          productId: p.id,
          finalQuantity: '12.000',
          reason: 'CORRECTION',
          note: 'Tentativa',
        });

      expect(response.status).toBe(403);
      expect(response.body.code).toBe('FORBIDDEN_ROLE');
    });

    it('ajuste sem efeito (mesma quantidade): 422, nada gravado', async () => {
      const p = await produto({ currentStock: '15.000' });

      const response = await request(app.getHttpServer())
        .post('/api/v1/stock-movements/adjustment')
        .set('Authorization', bearer(admin))
        .send({
          productId: p.id,
          finalQuantity: '15.000',
          reason: 'CORRECTION',
          note: 'Sem mudança',
        });

      expect(response.status).toBe(422);
      expect(await prisma.stockMovement.count()).toBe(0);
    });

    it('INVENTORY_ADJUSTMENT é recusado no ajuste manual: 422', async () => {
      const p = await produto({ currentStock: '15.000' });

      const response = await request(app.getHttpServer())
        .post('/api/v1/stock-movements/adjustment')
        .set('Authorization', bearer(admin))
        .send({
          productId: p.id,
          finalQuantity: '12.000',
          reason: 'INVENTORY_ADJUSTMENT',
          note: 'Tentativa de forjar um ajuste de inventário',
        });

      expect(response.status).toBe(422);
      expect(response.body.code).toBe('INVALID_TYPE_REASON');
    });

    it('nota é obrigatória: 400 sem note', async () => {
      const p = await produto({ currentStock: '15.000' });

      const response = await request(app.getHttpServer())
        .post('/api/v1/stock-movements/adjustment')
        .set('Authorization', bearer(admin))
        .send({ productId: p.id, finalQuantity: '12.000', reason: 'CORRECTION' });

      expect(response.status).toBe(400);
    });

    it('finalQuantity zero é aceita (esvaziar o estoque)', async () => {
      const p = await produto({ currentStock: '3.000' });

      const response = await request(app.getHttpServer())
        .post('/api/v1/stock-movements/adjustment')
        .set('Authorization', bearer(admin))
        .send({
          productId: p.id,
          finalQuantity: '0.000',
          reason: 'CORRECTION',
          note: 'Zerou o estoque',
        });

      expect(response.status).toBe(201);
      expect(response.body.stockAfter).toBe('0.000');
    });

    it('entrada que estouraria numeric(14,3): 422, não 500', async () => {
      const p = await produto({ currentStock: '99999999999.000' });

      const response = await request(app.getHttpServer())
        .post('/api/v1/stock-movements/in')
        .set('Authorization', bearer(admin))
        .send({ productId: p.id, quantity: '1.000', reason: 'PURCHASE' });

      expect(response.status).toBe(422);
      expect(await prisma.stockMovement.count()).toBe(0);
    });
  });

  describe('imutabilidade: sem PATCH nem DELETE', () => {
    it('PATCH /stock-movements/:id não existe (404)', async () => {
      const response = await request(app.getHttpServer())
        .patch('/api/v1/stock-movements/0199a000-0000-7000-8000-000000000000')
        .set('Authorization', bearer(admin))
        .send({ note: 'tentativa' });

      expect(response.status).toBe(404);
    });

    it('DELETE /stock-movements/:id não existe (404)', async () => {
      const response = await request(app.getHttpServer())
        .delete('/api/v1/stock-movements/0199a000-0000-7000-8000-000000000000')
        .set('Authorization', bearer(admin));

      expect(response.status).toBe(404);
    });
  });

  describe('GET /stock-movements/:id', () => {
    it('devolve o detalhe', async () => {
      const p = await produto({ currentStock: '10.000' });
      const criada = await request(app.getHttpServer())
        .post('/api/v1/stock-movements/in')
        .set('Authorization', bearer(operator))
        .send({ productId: p.id, quantity: '1.000', reason: 'PURCHASE' });

      const response = await request(app.getHttpServer())
        .get(`/api/v1/stock-movements/${criada.body.id as string}`)
        .set('Authorization', bearer(operator));

      expect(response.status).toBe(200);
      expect(response.body.id).toBe(criada.body.id);
    });

    it('404 para id inexistente', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/stock-movements/0199a000-0000-7000-8000-000000000000')
        .set('Authorization', bearer(operator));

      expect(response.status).toBe(404);
      expect(response.body.code).toBe('NOT_FOUND');
    });
  });

  describe('GET /stock-movements', () => {
    it('lista paginada, mais recente primeiro por padrão', async () => {
      const p = await produto({ currentStock: '0.000' });

      for (let i = 0; i < 3; i++) {
        await request(app.getHttpServer())
          .post('/api/v1/stock-movements/in')
          .set('Authorization', bearer(operator))
          .send({ productId: p.id, quantity: '1.000', reason: 'PURCHASE' });
      }

      const response = await request(app.getHttpServer())
        .get('/api/v1/stock-movements')
        .set('Authorization', bearer(operator));

      const page = pageOf<{ id: string; createdAt: string }>(response);
      expect(page.meta.total).toBe(3);
      const datas = page.data.map((m) => new Date(m.createdAt).getTime());
      expect(datas).toEqual([...datas].sort((a, b) => b - a));
    });

    it('filtra por productId, type e reason', async () => {
      const p1 = await produto({ currentStock: '10.000' });
      const p2 = await produto({ currentStock: '10.000' });

      await request(app.getHttpServer())
        .post('/api/v1/stock-movements/in')
        .set('Authorization', bearer(operator))
        .send({ productId: p1.id, quantity: '1.000', reason: 'PURCHASE' });
      await request(app.getHttpServer())
        .post('/api/v1/stock-movements/out')
        .set('Authorization', bearer(operator))
        .send({ productId: p1.id, quantity: '1.000', reason: 'SALE' });
      await request(app.getHttpServer())
        .post('/api/v1/stock-movements/in')
        .set('Authorization', bearer(operator))
        .send({ productId: p2.id, quantity: '1.000', reason: 'PURCHASE' });

      const porProduto = pageOf(
        await request(app.getHttpServer())
          .get(`/api/v1/stock-movements?productId=${p1.id}`)
          .set('Authorization', bearer(operator)),
      );
      expect(porProduto.meta.total).toBe(2);

      const porTipo = pageOf(
        await request(app.getHttpServer())
          .get('/api/v1/stock-movements?type=OUT')
          .set('Authorization', bearer(operator)),
      );
      expect(porTipo.meta.total).toBe(1);

      const porMotivo = pageOf(
        await request(app.getHttpServer())
          .get('/api/v1/stock-movements?reason=PURCHASE')
          .set('Authorization', bearer(operator)),
      );
      expect(porMotivo.meta.total).toBe(2);
    });

    it('sort fora da allowlist: 400', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/stock-movements?sort=note')
        .set('Authorization', bearer(operator));

      expect(response.status).toBe(400);
    });
  });

  describe('GET /products/:id/movements', () => {
    it('devolve o histórico do produto', async () => {
      const p = await produto({ currentStock: '10.000' });
      await request(app.getHttpServer())
        .post('/api/v1/stock-movements/out')
        .set('Authorization', bearer(operator))
        .send({ productId: p.id, quantity: '2.000', reason: 'SALE' });

      const response = await request(app.getHttpServer())
        .get(`/api/v1/products/${p.id}/movements`)
        .set('Authorization', bearer(operator));

      const page = pageOf<{ productId: string }>(response);
      expect(response.status).toBe(200);
      expect(page.meta.total).toBe(1);
      expect(page.data[0]?.productId).toBe(p.id);
    });

    it('produto sem movimentação devolve lista VAZIA, não 404', async () => {
      const p = await produto();

      const response = await request(app.getHttpServer())
        .get(`/api/v1/products/${p.id}/movements`)
        .set('Authorization', bearer(operator));

      expect(response.status).toBe(200);
      expect(pageOf(response).meta.total).toBe(0);
    });

    it('produto inexistente: 404', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/products/0199a000-0000-7000-8000-000000000000/movements')
        .set('Authorization', bearer(operator));

      expect(response.status).toBe(404);
    });

    it('não mistura o histórico de outro produto', async () => {
      const p1 = await produto({ currentStock: '10.000' });
      const p2 = await produto({ currentStock: '10.000' });
      await request(app.getHttpServer())
        .post('/api/v1/stock-movements/in')
        .set('Authorization', bearer(operator))
        .send({ productId: p1.id, quantity: '1.000', reason: 'PURCHASE' });
      await request(app.getHttpServer())
        .post('/api/v1/stock-movements/in')
        .set('Authorization', bearer(operator))
        .send({ productId: p2.id, quantity: '1.000', reason: 'PURCHASE' });

      const response = await request(app.getHttpServer())
        .get(`/api/v1/products/${p1.id}/movements`)
        .set('Authorization', bearer(operator));

      expect(pageOf(response).meta.total).toBe(1);
    });
  });

  describe('sem token', () => {
    const rotas: { method: 'get' | 'post'; path: string }[] = [
      { method: 'get', path: '/api/v1/stock-movements' },
      { method: 'post', path: '/api/v1/stock-movements/in' },
      { method: 'post', path: '/api/v1/stock-movements/out' },
      { method: 'post', path: '/api/v1/stock-movements/adjustment' },
    ];

    it.each(rotas)('401 em $method $path', async ({ method, path }) => {
      const response = await request(app.getHttpServer())[method](path).send({});

      expect(response.status).toBe(401);
    });
  });
});
