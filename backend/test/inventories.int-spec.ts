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
 * Ciclo de inventário (marco 5B, docs/17-plano-fase-5.md §17.6).
 *
 * AP-2 e EX-6 são os critérios de aceite do roadmap para este marco, ao pé da
 * letra: cinco aprovações simultâneas do mesmo inventário produzem 1 sucesso
 * e 4 recusas; um produto não pode estar em dois inventários não finalizados
 * ao mesmo tempo.
 */
describe('Inventário (integração)', () => {
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
    await removeInsertFailure(prisma, 'stock_movements');
    await removeInsertFailure(prisma, 'audit_logs');
    await assertStockInvariants(prisma);
  });

  function openInventory(session: Session, productIds: string[], note?: string) {
    return request(app.getHttpServer())
      .post('/api/v1/inventories')
      .set('Authorization', bearer(session))
      .send({ productIds, ...(note !== undefined ? { note } : {}) });
  }

  function count(session: Session, inventoryId: string, itemId: string, countedQty: string) {
    return request(app.getHttpServer())
      .patch(`/api/v1/inventories/${inventoryId}/items/${itemId}/count`)
      .set('Authorization', bearer(session))
      .send({ countedQty });
  }

  function submit(session: Session, inventoryId: string) {
    return request(app.getHttpServer())
      .post(`/api/v1/inventories/${inventoryId}/submit`)
      .set('Authorization', bearer(session));
  }

  function approve(session: Session, inventoryId: string) {
    return request(app.getHttpServer())
      .post(`/api/v1/inventories/${inventoryId}/approve`)
      .set('Authorization', bearer(session));
  }

  function cancel(session: Session, inventoryId: string) {
    return request(app.getHttpServer())
      .post(`/api/v1/inventories/${inventoryId}/cancel`)
      .set('Authorization', bearer(session));
  }

  async function openAndGetItem(session: Session, productId: string) {
    const openResp = await openInventory(session, [productId]);
    const inventoryId = (openResp.body as { id: string }).id;
    const detail = await request(app.getHttpServer())
      .get(`/api/v1/inventories/${inventoryId}`)
      .set('Authorization', bearer(session));
    const itemId = (detail.body as { items: { id: string }[] }).items[0]?.id as string;

    return { inventoryId, itemId };
  }

  /**
   * Revisão do contrato (docs/17-plano-fase-5.md §17.4.3, literal): `GET
   * /inventories` é "lista paginada, filtro por status" — SEM os campos de
   * item (`expectedQty`, `countedQty`, `divergence`...), que a mesma seção
   * reserva ao detalhe ("Detalhe: cada item traz..."). A ausência de `items`
   * na listagem não é uma omissão: é a forma que o próprio plano descreve.
   */
  /**
   * BD-4 a BD-6 (§17.4.5, D11): o corpo de pior caso da abertura (200 UUIDs +
   * `note` de 500 caracteres, ~10,6 KiB) passa; 201 ids é recusado pela
   * VALIDAÇÃO do DTO (antes de qualquer acesso ao banco), não pelo limite de
   * bytes; e o limite GLOBAL de 16 KiB (herdado da Fase 4, `bootstrap.ts`,
   * sem exceção por rota) continua valendo para `/inventories` como para
   * qualquer outra rota.
   */
  describe('BD-4 a BD-6: orçamento de corpo da abertura', () => {
    it('BD-4: o pior caso (200 produtos + note de 500) é aceito (201)', async () => {
      const produtos = await Promise.all(
        Array.from({ length: 200 }, () =>
          createProduct(prisma, categoryId, { currentStock: '10.000' }),
        ),
      );

      const resp = await openInventory(
        manager,
        produtos.map((p) => p.id),
        'x'.repeat(500),
      );

      expect(resp.status).toBe(201);
      expect(
        await prisma.inventoryItem.count({
          where: { inventoryId: (resp.body as { id: string }).id },
        }),
      ).toBe(200);
    });

    it('BD-5: 201 ids é recusado pela validação do DTO (400), antes de tocar o banco', async () => {
      const resp = await openInventory(
        manager,
        Array.from({ length: 201 }, () => '0199a000-0000-7000-8000-000000000001'),
      );

      expect(resp.status).toBe(400);
      expect(await prisma.inventory.count()).toBe(0);
    });

    it('BD-6: corpo acima de 16 KiB é 413 (limite global, sem exceção por rota)', async () => {
      const resp = await request(app.getHttpServer())
        .post('/api/v1/inventories')
        .set('Authorization', bearer(manager))
        .set('Content-Type', 'application/json')
        .send(JSON.stringify({ productIds: [], note: 'x'.repeat(16 * 1024 + 1) }));

      expect(resp.status).toBe(413);
    });
  });

  describe('Contrato: GET /inventories (lista) × GET /inventories/:id (detalhe)', () => {
    it('a listagem pagina, filtra por status e NÃO traz `items`; o detalhe traz', async () => {
      const p1 = await createProduct(prisma, categoryId, { currentStock: '10.000' });
      const p2 = await createProduct(prisma, categoryId, { currentStock: '10.000' });
      const aberto = await openInventory(manager, [p1.id]);
      const inventoryIdAberto = (aberto.body as { id: string }).id;
      const cancelado = await openInventory(manager, [p2.id]);
      await cancel(manager, (cancelado.body as { id: string }).id);

      const lista = await request(app.getHttpServer())
        .get('/api/v1/inventories')
        .set('Authorization', bearer(operator));

      expect(lista.status).toBe(200);
      const corpo = lista.body as {
        data: { id: string; code: string; status: string; items?: unknown }[];
        meta: { page: number; limit: number; total: number };
      };
      expect(corpo.meta).toMatchObject({ page: 1, total: 2 });
      // Os campos documentados da listagem estão presentes...
      expect(corpo.data[0]).toHaveProperty('code');
      expect(corpo.data[0]).toHaveProperty('status');
      expect(corpo.data[0]).toHaveProperty('startedAt');
      // ...e `items` está ausente em TODAS as linhas da listagem.
      expect(corpo.data.every((linha) => !('items' in linha))).toBe(true);

      const filtrada = await request(app.getHttpServer())
        .get('/api/v1/inventories?status=CANCELLED')
        .set('Authorization', bearer(operator));
      const statusFiltrada = (filtrada.body as { data: { status: string }[] }).data.map(
        (i) => i.status,
      );
      expect(statusFiltrada).toEqual(['CANCELLED']);

      const detalhe = await request(app.getHttpServer())
        .get(`/api/v1/inventories/${inventoryIdAberto}`)
        .set('Authorization', bearer(operator));
      const corpoDetalhe = detalhe.body as {
        items: { productId: string; productSku?: string; productName?: string }[];
      };
      expect(Array.isArray(corpoDetalhe.items)).toBe(true);
      expect(corpoDetalhe.items).toHaveLength(1);
      // M7C-2: o detalhe embute SKU e nome do produto, para o frontend não
      // precisar de um `GET /products/:id` por item.
      expect(corpoDetalhe.items[0]).toMatchObject({
        productId: p1.id,
        productSku: p1.sku,
        productName: p1.name,
      });
    });
  });

  describe('Ciclo completo', () => {
    it('abre, conta, envia, aprova e aplica o delta (S1: sem movimento, 10 → 8)', async () => {
      const p = await createProduct(prisma, categoryId, { currentStock: '10.000' });
      const { inventoryId, itemId } = await openAndGetItem(manager, p.id);

      const contagem = await count(operator, inventoryId, itemId, '8.000');
      expect(contagem.status).toBe(200);
      expect((contagem.body as { divergence: string }).divergence).toBe('-2.000');

      const envio = await submit(operator, inventoryId);
      expect(envio.status).toBe(201);
      expect((envio.body as { status: string }).status).toBe('PENDING_APPROVAL');

      const aprovacao = await approve(manager, inventoryId);
      expect(aprovacao.status).toBe(201);
      const corpo = aprovacao.body as {
        inventory: { status: string };
        adjustments: { appliedDelta: string; stockAfter: string }[];
        adjustedItemsCount: number;
      };
      expect(corpo.inventory.status).toBe('APPROVED');
      expect(corpo.adjustedItemsCount).toBe(1);
      expect(corpo.adjustments[0]?.appliedDelta).toBe('-2.000');
      expect(corpo.adjustments[0]?.stockAfter).toBe('8.000');

      const produto = await prisma.product.findUniqueOrThrow({ where: { id: p.id } });
      expect(produto.currentStock.toString()).toBe('8');

      const movimento = await prisma.stockMovement.findFirst({ where: { productId: p.id } });
      expect(movimento?.reason).toBe('INVENTORY_ADJUSTMENT');
      expect(movimento?.inventoryItemId).toBe(itemId);
    });

    it('S2: entrada depois da contagem sem divergência não gera ajuste', async () => {
      const p = await createProduct(prisma, categoryId, { currentStock: '10.000' });
      const { inventoryId, itemId } = await openAndGetItem(manager, p.id);

      await count(operator, inventoryId, itemId, '10.000');
      await request(app.getHttpServer())
        .post('/api/v1/stock-movements/in')
        .set('Authorization', bearer(operator))
        .send({ productId: p.id, quantity: '5.000', reason: 'PURCHASE' });
      await submit(operator, inventoryId);

      const aprovacao = await approve(manager, inventoryId);
      expect(aprovacao.status).toBe(201);
      const corpo = aprovacao.body as { adjustedItemsCount: number };
      expect(corpo.adjustedItemsCount).toBe(0);

      const produto = await prisma.product.findUniqueOrThrow({ where: { id: p.id } });
      expect(produto.currentStock.toString()).toBe('15');
    });

    it('S4: saída depois da contagem — o delta soma sobre o saldo JÁ movido, não sobre o congelado', async () => {
      const p = await createProduct(prisma, categoryId, { currentStock: '10.000' });
      const { inventoryId, itemId } = await openAndGetItem(manager, p.id);

      await count(operator, inventoryId, itemId, '8.000'); // expected=10, counted=8, delta=-2
      await request(app.getHttpServer())
        .post('/api/v1/stock-movements/out')
        .set('Authorization', bearer(operator))
        .send({ productId: p.id, quantity: '3.000', reason: 'SALE' }); // 10 -> 7
      await submit(operator, inventoryId);
      await approve(manager, inventoryId); // aplica -2 sobre 7 => 5

      const produto = await prisma.product.findUniqueOrThrow({ where: { id: p.id } });
      expect(produto.currentStock.toString()).toBe('5');
    });

    it('S6: delta que levaria a saldo negativo é recusado, inventário continua PENDING_APPROVAL', async () => {
      const p = await createProduct(prisma, categoryId, { currentStock: '10.000' });
      const { inventoryId, itemId } = await openAndGetItem(manager, p.id);

      await count(operator, inventoryId, itemId, '4.000'); // expected=10, counted=4, delta=-6
      await request(app.getHttpServer())
        .post('/api/v1/stock-movements/out')
        .set('Authorization', bearer(operator))
        .send({ productId: p.id, quantity: '9.000', reason: 'SALE' }); // 10 -> 1
      await submit(operator, inventoryId);

      const aprovacao = await approve(manager, inventoryId);
      expect(aprovacao.status).toBe(409);
      const corpo = aprovacao.body as { code: string; details: { problems: unknown[] } };
      expect(corpo.code).toBe('INSUFFICIENT_STOCK');
      expect(corpo.details.problems).toHaveLength(1);

      const inventario = await prisma.inventory.findUniqueOrThrow({ where: { id: inventoryId } });
      expect(inventario.status).toBe('PENDING_APPROVAL');
      const produto = await prisma.product.findUniqueOrThrow({ where: { id: p.id } });
      expect(produto.currentStock.toString()).toBe('1');
      expect(
        await prisma.stockMovement.count({
          where: { productId: p.id, reason: 'INVENTORY_ADJUSTMENT' },
        }),
      ).toBe(0);
    });

    it('cancela preservando o histórico', async () => {
      const p = await createProduct(prisma, categoryId, { currentStock: '10.000' });
      const { inventoryId } = await openAndGetItem(manager, p.id);

      const resp = await cancel(manager, inventoryId);
      expect(resp.status).toBe(201);
      expect((resp.body as { status: string }).status).toBe('CANCELLED');

      const inventario = await prisma.inventory.findUniqueOrThrow({ where: { id: inventoryId } });
      expect(inventario.closedAt).not.toBeNull();

      // o produto foi liberado: um novo inventário pode selecioná-lo
      const reabertura = await openInventory(manager, [p.id]);
      expect(reabertura.status).toBe(201);
    });

    it('enviar sem nenhum item contado é 422', async () => {
      const p = await createProduct(prisma, categoryId, { currentStock: '10.000' });
      const { inventoryId } = await openAndGetItem(manager, p.id);

      const resp = await submit(operator, inventoryId);
      expect(resp.status).toBe(422);
    });

    it('contar fora de OPEN/COUNTING é 409 INVENTORY_NOT_OPEN', async () => {
      const p = await createProduct(prisma, categoryId, { currentStock: '10.000' });
      const { inventoryId, itemId } = await openAndGetItem(manager, p.id);
      await cancel(manager, inventoryId);

      const resp = await count(operator, inventoryId, itemId, '5.000');
      expect(resp.status).toBe(409);
      expect((resp.body as { code: string }).code).toBe('INVENTORY_NOT_OPEN');
    });

    it('aprovar um inventário já aprovado é 409 INVENTORY_ALREADY_APPROVED', async () => {
      const p = await createProduct(prisma, categoryId, { currentStock: '10.000' });
      const { inventoryId, itemId } = await openAndGetItem(manager, p.id);
      await count(operator, inventoryId, itemId, '8.000');
      await submit(operator, inventoryId);
      await approve(manager, inventoryId);

      const segunda = await approve(manager, inventoryId);
      expect(segunda.status).toBe(409);
      expect((segunda.body as { code: string }).code).toBe('INVENTORY_ALREADY_APPROVED');
    });

    it('item de outro inventário (ou inexistente) é 404', async () => {
      const p1 = await createProduct(prisma, categoryId, { currentStock: '10.000' });
      const p2 = await createProduct(prisma, categoryId, { currentStock: '5.000' });
      const { inventoryId: inv1 } = await openAndGetItem(manager, p1.id);
      const { itemId: item2 } = await openAndGetItem(manager, p2.id);

      const resp = await count(operator, inv1, item2, '5.000');
      expect(resp.status).toBe(404);
    });
  });

  describe('D9: ajuste de inventário em produto inativo', () => {
    it('aprovação ajusta produto inativo (200/201); entrada, saída e ajuste manual continuam recusando', async () => {
      const p = await createProduct(prisma, categoryId, {
        currentStock: '10.000',
        isActive: false,
      });
      const { inventoryId, itemId } = await openAndGetItem(admin, p.id);

      await count(operator, inventoryId, itemId, '7.000');
      await submit(operator, inventoryId);
      const aprovacao = await approve(admin, inventoryId);
      expect(aprovacao.status).toBe(201);

      const produto = await prisma.product.findUniqueOrThrow({ where: { id: p.id } });
      expect(produto.currentStock.toString()).toBe('7');

      const saida = await request(app.getHttpServer())
        .post('/api/v1/stock-movements/out')
        .set('Authorization', bearer(operator))
        .send({ productId: p.id, quantity: '1.000', reason: 'SALE' });
      expect(saida.status).toBe(409);
      expect((saida.body as { code: string }).code).toBe('PRODUCT_INACTIVE');
    });

    it('OPERATOR não aprova (403) nem abre inventário (403)', async () => {
      const p = await createProduct(prisma, categoryId, { currentStock: '10.000' });

      const aberturaNegada = await openInventory(operator, [p.id]);
      expect(aberturaNegada.status).toBe(403);

      const { inventoryId, itemId } = await openAndGetItem(manager, p.id);
      await count(operator, inventoryId, itemId, '7.000');
      await submit(operator, inventoryId);

      const aprovacaoNegada = await approve(operator, inventoryId);
      expect(aprovacaoNegada.status).toBe(403);
    });
  });

  describe('Exclusividade (D2/D17)', () => {
    it('um produto já em inventário não finalizado não pode entrar em outro', async () => {
      const p = await createProduct(prisma, categoryId, { currentStock: '10.000' });
      await openInventory(manager, [p.id]);

      const segunda = await openInventory(manager, [p.id]);
      expect(segunda.status).toBe(409);
      expect((segunda.body as { code: string }).code).toBe('PRODUCT_IN_OPEN_INVENTORY');
    });

    it('DUP-6: abertura idêntica simultânea do mesmo produto = 1 sucesso, 1 recusa, nenhum item parcial', async () => {
      const p = await createProduct(prisma, categoryId, { currentStock: '10.000' });

      const [r1, r2] = await Promise.all([
        openInventory(manager, [p.id]),
        openInventory(manager, [p.id]),
      ]);
      const statuses = [r1.status, r2.status].sort();
      expect(statuses).toEqual([201, 409]);

      const itens = await prisma.inventoryItem.count({ where: { productId: p.id } });
      expect(itens).toBe(1);
    });

    it('EX-6: dez aberturas simultâneas do mesmo produto = exatamente 1 sucesso', async () => {
      const p = await createProduct(prisma, categoryId, { currentStock: '10.000' });

      const respostas = await Promise.all(
        Array.from({ length: 10 }, () => openInventory(manager, [p.id])),
      );
      expect(respostas.filter((r) => r.status === 201)).toHaveLength(1);
      expect(respostas.filter((r) => r.status === 409)).toHaveLength(9);
    });

    it('produto inexistente na seleção é 422', async () => {
      const resp = await openInventory(manager, ['0199a000-0000-7000-8000-00000000ffff']);
      expect(resp.status).toBe(422);
    });

    /**
     * Revisão pós-5A: a primeira implementação usava um advisory lock que
     * serializava a transação de abertura INTEIRA, inclusive duas aberturas
     * SEM produto em comum — bloqueio que o plano nunca pediu
     * (docs/17-plano-fase-5.md §17.6.2 só exige a trava em torno da geração
     * do código, "não faz parte da garantia"). Removido: a unicidade de
     * código agora é por retentativa sobre a violação de unicidade do banco
     * (`inventories_code_key`), e a exclusividade de produto continua
     * inteiramente do índice único parcial (D17), sem relação com código.
     */
    it('duas aberturas de produtos DIFERENTES não esperam uma pela outra: ambas 201, códigos distintos', async () => {
      const p1 = await createProduct(prisma, categoryId, { currentStock: '10.000' });
      const p2 = await createProduct(prisma, categoryId, { currentStock: '10.000' });

      const [r1, r2] = await Promise.all([
        openInventory(manager, [p1.id]),
        openInventory(manager, [p2.id]),
      ]);

      expect(r1.status).toBe(201);
      expect(r2.status).toBe(201);
      const codigo1 = (r1.body as { code: string }).code;
      const codigo2 = (r2.body as { code: string }).code;
      expect(codigo1).not.toBe(codigo2);
    });

    it('vinte aberturas simultâneas, todas de produtos diferentes: 20 sucessos, 20 códigos únicos', async () => {
      const produtos = await Promise.all(
        Array.from({ length: 20 }, () =>
          createProduct(prisma, categoryId, { currentStock: '10.000' }),
        ),
      );

      const respostas = await Promise.all(produtos.map((p) => openInventory(manager, [p.id])));

      expect(respostas.every((r) => r.status === 201)).toBe(true);
      const codigos = respostas.map((r) => (r.body as { code: string }).code);
      expect(new Set(codigos).size).toBe(20);
    });
  });

  describe('AP-2 / DUP-8: aprovação simultânea não produz ajustes duplicados', () => {
    /** Este caso É o DUP-8 do plano: mesmo cenário, mesma prova — 1 nome a menos para manter. */
    it('cinco aprovações simultâneas do mesmo inventário = 1 sucesso, 4 recusas; ajuste aplicado uma única vez', async () => {
      const p = await createProduct(prisma, categoryId, { currentStock: '10.000' });
      const { inventoryId, itemId } = await openAndGetItem(manager, p.id);
      await count(operator, inventoryId, itemId, '7.000');
      await submit(operator, inventoryId);

      const respostas = await Promise.all(
        Array.from({ length: 5 }, () => approve(manager, inventoryId)),
      );
      expect(respostas.filter((r) => r.status === 201)).toHaveLength(1);
      expect(respostas.filter((r) => r.status === 409)).toHaveLength(4);

      const produto = await prisma.product.findUniqueOrThrow({ where: { id: p.id } });
      expect(produto.currentStock.toString()).toBe('7');
      expect(await prisma.stockMovement.count({ where: { productId: p.id } })).toBe(1);
    });
  });

  describe('Atomicidade (AT-4, AT-5)', () => {
    it('AT-4: falha no movimento do 2º item não aplica NENHUM ajuste; inventário continua PENDING_APPROVAL', async () => {
      const p1 = await createProduct(prisma, categoryId, { currentStock: '10.000' });
      const p2 = await createProduct(prisma, categoryId, { currentStock: '10.000' });
      const abertura = await openInventory(manager, [p1.id, p2.id]);
      const inventoryId = (abertura.body as { id: string }).id;
      const detalhe = await request(app.getHttpServer())
        .get(`/api/v1/inventories/${inventoryId}`)
        .set('Authorization', bearer(manager));
      const itens = (detalhe.body as { items: { id: string; productId: string }[] }).items;
      const item1 = itens.find((i) => i.productId === p1.id);
      const item2 = itens.find((i) => i.productId === p2.id);

      await count(operator, inventoryId, item1?.id as string, '8.000');
      await count(operator, inventoryId, item2?.id as string, '6.000');
      await submit(operator, inventoryId);

      await withInsertFailure(prisma, 'stock_movements', async () => {
        const resp = await approve(manager, inventoryId);
        expect(resp.status).toBe(500);
      });

      const produto1 = await prisma.product.findUniqueOrThrow({ where: { id: p1.id } });
      const produto2 = await prisma.product.findUniqueOrThrow({ where: { id: p2.id } });
      expect(produto1.currentStock.toString()).toBe('10');
      expect(produto2.currentStock.toString()).toBe('10');
      expect(await prisma.stockMovement.count()).toBe(0);

      const inventario = await prisma.inventory.findUniqueOrThrow({ where: { id: inventoryId } });
      expect(inventario.status).toBe('PENDING_APPROVAL');

      const segunda = await approve(manager, inventoryId);
      expect(segunda.status).toBe(201);
    });

    it('AT-5: falha na auditoria da aprovação desfaz os ajustes já aplicados', async () => {
      const p = await createProduct(prisma, categoryId, { currentStock: '10.000' });
      const { inventoryId, itemId } = await openAndGetItem(manager, p.id);
      await count(operator, inventoryId, itemId, '7.000');
      await submit(operator, inventoryId);

      await withInsertFailure(prisma, 'audit_logs', async () => {
        const resp = await approve(manager, inventoryId);
        expect(resp.status).toBe(500);
      });

      const produto = await prisma.product.findUniqueOrThrow({ where: { id: p.id } });
      expect(produto.currentStock.toString()).toBe('10');
      expect(await prisma.stockMovement.count()).toBe(0);
      const inventario = await prisma.inventory.findUniqueOrThrow({ where: { id: inventoryId } });
      expect(inventario.status).toBe('PENDING_APPROVAL');
    });

    it('AT-6: falha na auditoria da contagem não grava a contagem', async () => {
      const p = await createProduct(prisma, categoryId, { currentStock: '10.000' });
      const { inventoryId, itemId } = await openAndGetItem(manager, p.id);

      await withInsertFailure(prisma, 'audit_logs', async () => {
        const resp = await count(operator, inventoryId, itemId, '7.000');
        expect(resp.status).toBe(500);
      });

      const item = await prisma.inventoryItem.findUniqueOrThrow({ where: { id: itemId } });
      expect(item.countedQty).toBeNull();
    });

    it('AT-7: falha na auditoria da abertura não deixa inventário nem item; produto livre', async () => {
      const p = await createProduct(prisma, categoryId, { currentStock: '10.000' });

      await withInsertFailure(prisma, 'audit_logs', async () => {
        const resp = await openInventory(manager, [p.id]);
        expect(resp.status).toBe(500);
      });

      expect(await prisma.inventory.count()).toBe(0);
      expect(await prisma.inventoryItem.count()).toBe(0);

      const abertura = await openInventory(manager, [p.id]);
      expect(abertura.status).toBe(201);
    });
  });

  describe('Cenários do delta (§17.6.4): S5, S7, S8, S9', () => {
    it('S5: divergência positiva sem movimento depois — final igual à contagem', async () => {
      const p = await createProduct(prisma, categoryId, { currentStock: '0.000' });
      const { inventoryId, itemId } = await openAndGetItem(manager, p.id);

      const contagem = await count(operator, inventoryId, itemId, '5.000');
      expect(contagem.status).toBe(200);
      expect(contagem.body as { expectedQty: string }).toMatchObject({ expectedQty: '0.000' });

      await submit(operator, inventoryId);
      const aprovacao = await approve(manager, inventoryId);
      expect(aprovacao.status).toBe(201);
      expect(
        (aprovacao.body as { adjustments: { appliedDelta: string }[] }).adjustments[0]
          ?.appliedDelta,
      ).toBe('5.000');

      const produto = await prisma.product.findUniqueOrThrow({ where: { id: p.id } });
      expect(produto.currentStock.toString()).toBe('5');
    });

    it('S7: recontagem com entrada entre as duas — expectedQty re-congelado no segundo valor', async () => {
      const p = await createProduct(prisma, categoryId, { currentStock: '10.000' });
      const { inventoryId, itemId } = await openAndGetItem(manager, p.id);

      // 1ª contagem: expected=10, counted=8.
      const primeira = await count(operator, inventoryId, itemId, '8.000');
      expect(primeira.body as { expectedQty: string }).toMatchObject({ expectedQty: '10.000' });

      // Entrada FÍSICA registrada no sistema entre as duas contagens: 10 → 12.
      await request(app.getHttpServer())
        .post('/api/v1/stock-movements/in')
        .set('Authorization', bearer(operator))
        .send({ productId: p.id, quantity: '2.000', reason: 'PURCHASE' });

      // 2ª contagem (recontagem): expected RE-CONGELADO no saldo atual (12), counted=10.
      const segunda = await count(operator, inventoryId, itemId, '10.000');
      expect(segunda.status).toBe(200);
      expect(segunda.body as { expectedQty: string; divergence: string }).toMatchObject({
        expectedQty: '12.000',
        divergence: '-2.000',
      });

      await submit(operator, inventoryId);
      const aprovacao = await approve(manager, inventoryId);
      expect(aprovacao.status).toBe(201);

      // delta = 10 - 12 = -2; saldo no momento da aprovação é 12 → final 10.
      const produto = await prisma.product.findUniqueOrThrow({ where: { id: p.id } });
      expect(produto.currentStock.toString()).toBe('10');
    });

    it('S8: recontagem SEM movimento entre as duas — a última contagem vence', async () => {
      const p = await createProduct(prisma, categoryId, { currentStock: '10.000' });
      const { inventoryId, itemId } = await openAndGetItem(manager, p.id);

      await count(operator, inventoryId, itemId, '8.000');
      const segunda = await count(operator, inventoryId, itemId, '9.000');
      expect(segunda.status).toBe(200);
      // Sem movimento entre as duas: expected continua 10 (o saldo não mudou).
      expect(segunda.body as { expectedQty: string }).toMatchObject({ expectedQty: '10.000' });

      await submit(operator, inventoryId);
      const aprovacao = await approve(manager, inventoryId);
      expect(aprovacao.status).toBe(201);

      // delta = 9 - 10 = -1 (da ÚLTIMA contagem, não da primeira) → final 9.
      const produto = await prisma.product.findUniqueOrThrow({ where: { id: p.id } });
      expect(produto.currentStock.toString()).toBe('9');
    });

    /**
     * S9 — o risco ACEITO PROVISORIAMENTE (D18, RA-2, §17.6.7), não um defeito
     * a corrigir aqui. Reproduz o cenário exato do plano: uma entrada ocorreu
     * FISICAMENTE antes da contagem (por isso a contagem física já a inclui),
     * mas só foi REGISTRADA no sistema depois. O teste PROVA o comportamento
     * real — a divergência dupla, o saldo final maior que o físico — e que o
     * sistema EXPÕE o sinal (`movedSinceCount` no detalhe, antes da aprovação)
     * sem o corrigir automaticamente. Não afirma detecção automática porque
     * não existe: é exatamente o que a D18 aceita.
     */
    it('S9: movimento físico anterior à contagem, registrado depois — divergência dupla, EXPOSTA mas não corrigida', async () => {
      const p = await createProduct(prisma, categoryId, { currentStock: '10.000' });
      const { inventoryId, itemId } = await openAndGetItem(manager, p.id);

      // A contagem física já encontra 12 (a entrada de +2 já aconteceu na
      // prateleira), mas o sistema ainda não sabe: expected = 10.
      const contagem = await count(operator, inventoryId, itemId, '12.000');
      expect(contagem.body as { expectedQty: string; divergence: string }).toMatchObject({
        expectedQty: '10.000',
        divergence: '2.000',
      });

      // Só DEPOIS da contagem alguém lança a entrada física no sistema.
      await request(app.getHttpServer())
        .post('/api/v1/stock-movements/in')
        .set('Authorization', bearer(operator))
        .send({ productId: p.id, quantity: '2.000', reason: 'PURCHASE' }); // 10 → 12

      // ANTES de aprovar, o detalhe já expõe o sinal: `movedSinceCount` não é
      // zero. O sistema NÃO corrige nada sozinho — só torna visível, para
      // revisão humana (o procedimento operacional do §17.6.7).
      const detalheAntes = await request(app.getHttpServer())
        .get(`/api/v1/inventories/${inventoryId}`)
        .set('Authorization', bearer(manager));
      const itemAntes = (
        detalheAntes.body as {
          items: {
            id: string;
            movedSinceCount: string | null;
            movementsSinceCount: number | null;
          }[];
        }
      ).items.find((i) => i.id === itemId);
      expect(itemAntes?.movedSinceCount).toBe('2.000');
      expect(itemAntes?.movementsSinceCount).toBe(1);

      await submit(operator, inventoryId);
      const aprovacao = await approve(manager, inventoryId);
      expect(aprovacao.status).toBe(201);

      // delta = 12 - 10 = +2, aplicado sobre o saldo JÁ ATUALIZADO (12) → 14.
      // O físico real é 12: o sistema registra 14, dois ACIMA do real — a
      // divergência dupla que a D18 documenta e aceita, não corrige.
      const produtoFinal = await prisma.product.findUniqueOrThrow({ where: { id: p.id } });
      expect(produtoFinal.currentStock.toString()).toBe('14');
      expect(produtoFinal.currentStock.toString()).not.toBe('12'); // o saldo físico real
    });
  });

  describe('AP-3, AP-4: travas adicionais da aprovação', () => {
    /**
     * AP-3 (G2): o próprio banco recusa um segundo ajuste do mesmo item —
     * `stock_movements.inventory_item_id` já é `@unique` desde a Fase 2. Em
     * uso normal isso nunca é alcançado (G1 — o `UPDATE ... WHERE
     * status='PENDING_APPROVAL'` — já impede uma segunda aprovação de chegar
     * à aplicação de delta, provado em AP-2/DUP-8). Este teste prova a
     * trava em si, por `INSERT` direto, independente de G1.
     */
    it('AP-3: um segundo movimento para o MESMO inventory_item_id é recusado pelo banco (G2)', async () => {
      const p = await createProduct(prisma, categoryId, { currentStock: '10.000' });
      const { inventoryId, itemId } = await openAndGetItem(manager, p.id);
      await count(operator, inventoryId, itemId, '8.000');
      await submit(operator, inventoryId);
      await approve(manager, inventoryId);

      const primeiro = await prisma.stockMovement.findFirstOrThrow({
        where: { inventoryItemId: itemId },
      });

      await expect(
        prisma.$executeRaw`
          INSERT INTO stock_movements (id, product_id, type, reason, quantity, stock_before, stock_after, user_id, inventory_item_id)
          VALUES (gen_random_uuid(), ${p.id}::uuid, 'ADJUSTMENT', 'INVENTORY_ADJUSTMENT', 1, 8, 9, ${operator.user.id}::uuid, ${itemId}::uuid)
        `,
      ).rejects.toThrow(/inventory_item_id/);

      expect(await prisma.stockMovement.count({ where: { inventoryItemId: itemId } })).toBe(1);
      void primeiro;
    });

    /**
     * AP-4: aprovação e saída concorrentes no MESMO produto não produzem
     * deadlock. As duas operações fazem `UPDATE products SET current_stock =
     * ... WHERE id = ...` na MESMA linha — o Postgres serializa por lock de
     * linha, nunca precisa detectar ciclo (não há ordem cruzada de múltiplas
     * linhas aqui, ao contrário da aprovação com vários itens). O que importa
     * provar é que as duas TERMINAM (sem timeout/erro de deadlock) e que o
     * resultado final é a composição correta dos dois efeitos, qualquer que
     * seja a ordem real.
     */
    it('AP-4: aprovação × saída concorrentes no mesmo produto terminam sem deadlock, saldo correto', async () => {
      const p = await createProduct(prisma, categoryId, { currentStock: '20.000' });
      const { inventoryId, itemId } = await openAndGetItem(manager, p.id);
      await count(operator, inventoryId, itemId, '15.000'); // expected=20, counted=15, delta=-5
      await submit(operator, inventoryId);

      const [aprovacaoResp, saidaResp] = await Promise.all([
        approve(manager, inventoryId),
        request(app.getHttpServer())
          .post('/api/v1/stock-movements/out')
          .set('Authorization', bearer(operator))
          .send({ productId: p.id, quantity: '3.000', reason: 'SALE' }),
      ]);

      expect(aprovacaoResp.status).toBe(201);
      expect(saidaResp.status).toBe(201);

      // 20 - 5 (ajuste) - 3 (saída) = 12, em QUALQUER ordem real de execução
      // (a saída usa o saldo atual no seu próprio UPDATE condicional, não um
      // valor lido antes — ADR-0003).
      const produto = await prisma.product.findUniqueOrThrow({ where: { id: p.id } });
      expect(produto.currentStock.toString()).toBe('12');
    });
  });

  describe('DUP-7, DUP-9: duplicatas no ciclo de inventário', () => {
    it('DUP-7: envio e cancelamento duplicados — o segundo é 409', async () => {
      const p = await createProduct(prisma, categoryId, { currentStock: '10.000' });
      const { inventoryId, itemId } = await openAndGetItem(manager, p.id);
      await count(operator, inventoryId, itemId, '8.000');

      const primeiroEnvio = await submit(operator, inventoryId);
      expect(primeiroEnvio.status).toBe(201);
      const segundoEnvio = await submit(operator, inventoryId);
      expect(segundoEnvio.status).toBe(409);

      // Cancelamento duplicado, a partir de PENDING_APPROVAL.
      const primeiroCancelamento = await cancel(manager, inventoryId);
      expect(primeiroCancelamento.status).toBe(201);
      const segundoCancelamento = await cancel(manager, inventoryId);
      expect(segundoCancelamento.status).toBe(409);
    });

    it('DUP-9: a mesma contagem duas vezes — as duas 200, auditoria com as duas, estado final é a última', async () => {
      const p = await createProduct(prisma, categoryId, { currentStock: '10.000' });
      const { inventoryId, itemId } = await openAndGetItem(manager, p.id);

      const primeira = await count(operator, inventoryId, itemId, '7.000');
      const segunda = await count(operator, inventoryId, itemId, '7.000');

      expect(primeira.status).toBe(200);
      expect(segunda.status).toBe(200);

      const auditorias = await prisma.auditLog.count({
        where: { action: 'INVENTORY_COUNT_RECORDED', entityId: itemId },
      });
      expect(auditorias).toBe(2);

      const item = await prisma.inventoryItem.findUniqueOrThrow({ where: { id: itemId } });
      expect(item.countedQty?.toString()).toBe('7');
    });
  });
});
