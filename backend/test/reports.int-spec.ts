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

describe('Dashboard e relatórios (integração)', () => {
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

  afterEach(async () => {
    await assertStockInvariants(prisma);
  });

  describe('Dashboard: estado vazio é zero, não erro', () => {
    it('summary devolve zeros sem nenhum dado', async () => {
      const resp = await request(app.getHttpServer())
        .get('/api/v1/dashboard/summary')
        .set('Authorization', bearer(operator));

      expect(resp.status).toBe(200);
      expect(resp.body).toEqual({
        activeProducts: 0,
        lowStock: 0,
        outOfStock: 0,
        movementsLast30Days: 0,
      });
    });

    it('movements-chart e recent-movements devolvem array vazio sem nenhum dado', async () => {
      const chart = await request(app.getHttpServer())
        .get('/api/v1/dashboard/movements-chart')
        .set('Authorization', bearer(operator));
      const recent = await request(app.getHttpServer())
        .get('/api/v1/dashboard/recent-movements')
        .set('Authorization', bearer(operator));

      expect(chart.body).toEqual([]);
      expect(recent.body).toEqual([]);
    });

    it('days fora de 1-90 e limit fora de 1-50 são 400', async () => {
      const diasInvalidos = await request(app.getHttpServer())
        .get('/api/v1/dashboard/movements-chart?days=91')
        .set('Authorization', bearer(operator));
      const limiteInvalido = await request(app.getHttpServer())
        .get('/api/v1/dashboard/recent-movements?limit=51')
        .set('Authorization', bearer(operator));

      expect(diasInvalidos.status).toBe(400);
      expect(limiteInvalido.status).toBe(400);
    });
  });

  describe('Dashboard: com dados reais', () => {
    it('summary conta estoque baixo e sem estoque corretamente', async () => {
      await createProduct(prisma, categoryId, { currentStock: '2.000', minStock: '5.000' }); // baixo
      await createProduct(prisma, categoryId, { currentStock: '0.000', minStock: '5.000' }); // zerado
      await createProduct(prisma, categoryId, { currentStock: '50.000', minStock: '5.000' }); // normal
      await createProduct(prisma, categoryId, {
        currentStock: '0.000',
        minStock: '5.000',
        isActive: false,
      }); // inativo, não conta

      const resp = await request(app.getHttpServer())
        .get('/api/v1/dashboard/summary')
        .set('Authorization', bearer(operator));

      expect(resp.body).toEqual({
        activeProducts: 3,
        lowStock: 1,
        outOfStock: 1,
        movementsLast30Days: 0,
      });
    });

    it('recent-movements traz o produto e o autor, mais recente primeiro', async () => {
      const p = await createProduct(prisma, categoryId, { currentStock: '10.000' });
      await request(app.getHttpServer())
        .post('/api/v1/stock-movements/in')
        .set('Authorization', bearer(operator))
        .send({ productId: p.id, quantity: '5.000', reason: 'PURCHASE' });
      await request(app.getHttpServer())
        .post('/api/v1/stock-movements/out')
        .set('Authorization', bearer(operator))
        .send({ productId: p.id, quantity: '2.000', reason: 'SALE' });

      const resp = await request(app.getHttpServer())
        .get('/api/v1/dashboard/recent-movements?limit=1')
        .set('Authorization', bearer(operator));

      expect(resp.body).toHaveLength(1);
      const item = (resp.body as { type: string; stockAfter: string }[])[0];
      expect(item?.type).toBe('OUT');
      expect(item?.stockAfter).toBe('13.000');
    });
  });

  describe('Relatórios', () => {
    it('low-stock e out-of-stock listam só o que se aplica', async () => {
      const baixo = await createProduct(prisma, categoryId, {
        currentStock: '2.000',
        minStock: '5.000',
      });
      const zerado = await createProduct(prisma, categoryId, {
        currentStock: '0.000',
        minStock: '5.000',
      });
      await createProduct(prisma, categoryId, { currentStock: '50.000', minStock: '5.000' });

      const low = await request(app.getHttpServer())
        .get('/api/v1/reports/low-stock')
        .set('Authorization', bearer(operator));
      const out = await request(app.getHttpServer())
        .get('/api/v1/reports/out-of-stock')
        .set('Authorization', bearer(operator));

      expect((low.body as { id: string; deficit: string }[]).map((r) => r.id)).toEqual([baixo.id]);
      expect((low.body as { deficit: string }[])[0]?.deficit).toBe('3.000');
      expect((out.body as { id: string }[]).map((r) => r.id)).toEqual([zerado.id]);
    });

    it('movements agrega por tipo e motivo, com filtro de data', async () => {
      const p = await createProduct(prisma, categoryId, { currentStock: '10.000' });
      await request(app.getHttpServer())
        .post('/api/v1/stock-movements/in')
        .set('Authorization', bearer(operator))
        .send({ productId: p.id, quantity: '5.000', reason: 'PURCHASE' });
      await request(app.getHttpServer())
        .post('/api/v1/stock-movements/in')
        .set('Authorization', bearer(operator))
        .send({ productId: p.id, quantity: '3.000', reason: 'PURCHASE' });

      const resp = await request(app.getHttpServer())
        .get('/api/v1/reports/movements')
        .set('Authorization', bearer(operator));

      const linha = (
        resp.body as {
          type: string;
          reason: string;
          movementsCount: number;
          totalQuantity: string;
        }[]
      ).find((r) => r.type === 'IN' && r.reason === 'PURCHASE');
      expect(linha?.movementsCount).toBe(2);
      expect(linha?.totalQuantity).toBe('8.000');

      const futuro = await request(app.getHttpServer())
        .get('/api/v1/reports/movements?dateFrom=2099-01-01')
        .set('Authorization', bearer(operator));
      expect(futuro.body).toEqual([]);

      // M7B-4: datas ISO válidas com fuso horário e ano bissexto são aceitas (200),
      // enquanto strings como semana ISO ('2026-W01'), formato básico ('20260101')
      // ou datas inexistentes ('2026-02-31') retornam 400 VALIDATION_ERROR (nunca 500).
      const comTimezone = await request(app.getHttpServer())
        .get('/api/v1/reports/movements?dateFrom=2024-02-29&dateTo=2099-12-31T23:59:59.000-03:00')
        .set('Authorization', bearer(operator));
      expect(comTimezone.status).toBe(200);

      for (const dataInvalida of ['2026-W01', '20260101', '2026-02-31', '2026-02-29']) {
        const invalidaFrom = await request(app.getHttpServer())
          .get(`/api/v1/reports/movements?dateFrom=${dataInvalida}`)
          .set('Authorization', bearer(operator));
        expect(invalidaFrom.status).toBe(400);
        expect(invalidaFrom.body.code).toBe('VALIDATION_ERROR');

        const invalidaTo = await request(app.getHttpServer())
          .get(`/api/v1/reports/movements?dateTo=${dataInvalida}`)
          .set('Authorization', bearer(operator));
        expect(invalidaTo.status).toBe(400);
        expect(invalidaTo.body.code).toBe('VALIDATION_ERROR');
      }

      const daysInvalido = await request(app.getHttpServer())
        .get('/api/v1/dashboard/movements-chart?days=15.9')
        .set('Authorization', bearer(operator));
      expect(daysInvalido.status).toBe(400);
      expect(daysInvalido.body.code).toBe('VALIDATION_ERROR');
    });

    it('inventories e divergences são restritos a A/M; stock-reconciliation só a A', async () => {
      const inv = await request(app.getHttpServer())
        .get('/api/v1/reports/inventories')
        .set('Authorization', bearer(operator));
      const div = await request(app.getHttpServer())
        .get('/api/v1/reports/divergences')
        .set('Authorization', bearer(operator));
      const rec = await request(app.getHttpServer())
        .get('/api/v1/reports/stock-reconciliation')
        .set('Authorization', bearer(manager));

      expect(inv.status).toBe(403);
      expect(div.status).toBe(403);
      expect(rec.status).toBe(403);

      const recAdmin = await request(app.getHttpServer())
        .get('/api/v1/reports/stock-reconciliation')
        .set('Authorization', bearer(admin));
      expect(recAdmin.status).toBe(200);
    });

    it('RC-3: stock-reconciliation detecta saldo adulterado por SQL direto', async () => {
      // Começa em 0 (como na produção) e só ganha saldo por movimento REAL —
      // `derived_stock` soma só (stock_after - stock_before) de movimentos, e
      // um fixture que semeasse `currentStock` direto no banco (prática usada
      // em outros testes) não teria movimento algum que o explicasse, o que o
      // relatório apontaria como divergência — exatamente o mesmo cuidado de
      // CI1b (docs/17 §17.7.6).
      const p = await createProduct(prisma, categoryId, { currentStock: '0.000' });
      await request(app.getHttpServer())
        .post('/api/v1/stock-movements/in')
        .set('Authorization', bearer(operator))
        .send({ productId: p.id, quantity: '10.000', reason: 'PURCHASE' });
      await request(app.getHttpServer())
        .post('/api/v1/stock-movements/in')
        .set('Authorization', bearer(operator))
        .send({ productId: p.id, quantity: '5.000', reason: 'PURCHASE' }); // saldo real: 15

      const limpa = await request(app.getHttpServer())
        .get('/api/v1/reports/stock-reconciliation')
        .set('Authorization', bearer(admin));
      expect(limpa.body).toEqual([]);

      // adultera o saldo por fora do service, sem gerar movimento
      await prisma.$executeRaw`UPDATE products SET current_stock = 999 WHERE id = ${p.id}::uuid`;

      const adulterada = await request(app.getHttpServer())
        .get('/api/v1/reports/stock-reconciliation')
        .set('Authorization', bearer(admin));
      expect(adulterada.body).toHaveLength(1);
      const linha = (
        adulterada.body as { id: string; currentStock: string; derivedStock: string }[]
      )[0];
      expect(linha?.id).toBe(p.id);
      expect(linha?.currentStock).toBe('999.000');
      expect(linha?.derivedStock).toBe('15.000');

      // desfaz a adulteração para não violar CI1b no afterEach
      await prisma.$executeRaw`UPDATE products SET current_stock = 15 WHERE id = ${p.id}::uuid`;
    });
  });
});
