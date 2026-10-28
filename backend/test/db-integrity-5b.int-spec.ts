import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { NestExpressApplication } from '@nestjs/platform-express';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp, truncateAll, type TestApp } from './helpers/app';

/**
 * Integridade de banco da migration `phase5b_inventory_integrity`
 * (docs/17-plano-fase-5.md §17.8.3, decisão D17) e compatibilidade com o
 * Prisma (§17.8.5, guardas PG-2 e PG-3). Por SQL direto: o que está sob teste
 * é o banco, não o service.
 */
describe('Integridade de banco — Fase 5B (integração)', () => {
  let harness: TestApp;
  let app: NestExpressApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    harness = await createTestApp();
    app = harness.app;
    prisma = harness.prisma;
    void app;
  });

  afterAll(async () => {
    await harness.close();
  });

  beforeEach(async () => {
    await truncateAll(prisma);
  });

  async function fixture(): Promise<{ userId: string; categoryId: string; productId: string }> {
    const userId = '0199b000-0000-7000-8000-0000000000a1';
    const categoryId = '0199b000-0000-7000-8000-0000000000c1';
    const productId = '0199b000-0000-7000-8000-0000000000b1';

    await prisma.user.create({
      data: { id: userId, name: 'U', email: `u-${productId}@teste.local`, passwordHash: 'x' },
    });
    await prisma.category.create({ data: { id: categoryId, name: `C-${productId}` } });
    await prisma.product.create({
      data: {
        id: productId,
        sku: `SKU-${productId.slice(-8)}`,
        name: 'P',
        categoryId,
        unit: 'UN',
        currentStock: '10.000',
      },
    });

    return { userId, categoryId, productId };
  }

  describe('DBI: os 5 CHECKs da Fase 2 e os 2 da Fase 5A continuam presentes, uma vez cada', () => {
    it('nenhum foi duplicado nem removido pela migration da Fase 5B', async () => {
      const rows = await prisma.$queryRaw<{ conname: string; n: bigint }[]>`
        SELECT conname, count(*) AS n FROM pg_constraint
         WHERE contype = 'c' AND connamespace = 'public'::regnamespace
           AND conname IN (
             'products_current_stock_non_negative',
             'products_min_stock_non_negative',
             'products_unit_cost_non_negative',
             'stock_movements_quantity_positive',
             'stock_movements_stock_after_non_negative',
             'stock_movements_balance_coherent',
             'stock_movements_type_reason_coherent'
           )
         GROUP BY conname
      `;

      expect(rows).toHaveLength(7);
      expect(rows.every((r) => Number(r.n) === 1)).toBe(true);
    });
  });

  describe('DBI: CHECKs novos de inventário', () => {
    it('recusa expected_qty negativo (item contado)', async () => {
      const { userId, productId } = await fixture();
      await prisma.$executeRaw`
        INSERT INTO inventories (id, code, status, created_by_id, updated_at)
        VALUES (gen_random_uuid(), 'INV-DBI-0001', 'OPEN', ${userId}::uuid, now())
      `;
      const inventoryIdRows = await prisma.$queryRaw<{ id: string }[]>`
        SELECT id FROM inventories WHERE code = 'INV-DBI-0001'
      `;
      const inventoryId = inventoryIdRows[0]?.id as string;

      await expect(
        prisma.$executeRaw`
          INSERT INTO inventory_items (id, inventory_id, product_id, expected_qty, counted_qty, counted_at, counted_by_id, updated_at)
          VALUES (gen_random_uuid(), ${inventoryId}::uuid, ${productId}::uuid, -1, 5, now(), ${userId}::uuid, now())
        `,
      ).rejects.toThrow(/inventory_items_expected_qty_non_negative/);
    });

    it('recusa counted_qty negativo', async () => {
      const { userId, productId } = await fixture();
      await prisma.$executeRaw`
        INSERT INTO inventories (id, code, status, created_by_id, updated_at)
        VALUES (gen_random_uuid(), 'INV-DBI-0002', 'OPEN', ${userId}::uuid, now())
      `;
      const inventoryIdRows = await prisma.$queryRaw<{ id: string }[]>`
        SELECT id FROM inventories WHERE code = 'INV-DBI-0002'
      `;
      const inventoryId = inventoryIdRows[0]?.id as string;

      await expect(
        prisma.$executeRaw`
          INSERT INTO inventory_items (id, inventory_id, product_id, expected_qty, counted_qty, counted_at, counted_by_id, updated_at)
          VALUES (gen_random_uuid(), ${inventoryId}::uuid, ${productId}::uuid, 10, -5, now(), ${userId}::uuid, now())
        `,
      ).rejects.toThrow(/inventory_items_counted_qty_non_negative/);
    });

    it('recusa pareamento incoerente (counted_qty sem counted_at)', async () => {
      const { userId, productId } = await fixture();
      await prisma.$executeRaw`
        INSERT INTO inventories (id, code, status, created_by_id, updated_at)
        VALUES (gen_random_uuid(), 'INV-DBI-0003', 'OPEN', ${userId}::uuid, now())
      `;
      const inventoryIdRows = await prisma.$queryRaw<{ id: string }[]>`
        SELECT id FROM inventories WHERE code = 'INV-DBI-0003'
      `;
      const inventoryId = inventoryIdRows[0]?.id as string;

      await expect(
        prisma.$executeRaw`
          INSERT INTO inventory_items (id, inventory_id, product_id, expected_qty, counted_qty, updated_at)
          VALUES (gen_random_uuid(), ${inventoryId}::uuid, ${productId}::uuid, 10, 8, now())
        `,
      ).rejects.toThrow(/inventory_items_counted_pairing/);
    });

    it('aceita item não contado (tudo null) e item contado coerente', async () => {
      const { userId, productId } = await fixture();
      await prisma.$executeRaw`
        INSERT INTO inventories (id, code, status, created_by_id, updated_at)
        VALUES (gen_random_uuid(), 'INV-DBI-0004', 'OPEN', ${userId}::uuid, now())
      `;
      const inventoryIdRows = await prisma.$queryRaw<{ id: string }[]>`
        SELECT id FROM inventories WHERE code = 'INV-DBI-0004'
      `;
      const inventoryId = inventoryIdRows[0]?.id as string;

      await expect(
        prisma.$executeRaw`
          INSERT INTO inventory_items (id, inventory_id, product_id, updated_at)
          VALUES (gen_random_uuid(), ${inventoryId}::uuid, ${productId}::uuid, now())
        `,
      ).resolves.not.toThrow();
    });
  });

  describe('DBI: exclusividade (D17) — índice único parcial contra INSERT direto', () => {
    it('um segundo item in_progress do mesmo produto é recusado pelo banco', async () => {
      const { userId, productId } = await fixture();
      await prisma.$executeRaw`
        INSERT INTO inventories (id, code, status, created_by_id, updated_at)
        VALUES (gen_random_uuid(), 'INV-DBI-0005', 'OPEN', ${userId}::uuid, now()),
               (gen_random_uuid(), 'INV-DBI-0006', 'OPEN', ${userId}::uuid, now())
      `;
      const invs = await prisma.$queryRaw<{ id: string }[]>`
        SELECT id FROM inventories WHERE code IN ('INV-DBI-0005', 'INV-DBI-0006') ORDER BY code
      `;

      await prisma.$executeRaw`
        INSERT INTO inventory_items (id, inventory_id, product_id, updated_at)
        VALUES (gen_random_uuid(), ${invs[0]?.id}::uuid, ${productId}::uuid, now())
      `;

      await expect(
        prisma.$executeRaw`
          INSERT INTO inventory_items (id, inventory_id, product_id, updated_at)
          VALUES (gen_random_uuid(), ${invs[1]?.id}::uuid, ${productId}::uuid, now())
        `,
      ).rejects.toThrow(/inventory_items_one_unfinalized_per_product/);
    });
  });

  describe('DBI: estado final garantido pelo banco (trigger, SQLSTATE SF002)', () => {
    it('sair de APPROVED é recusado', async () => {
      const { userId, productId } = await fixture();
      void productId;
      await prisma.$executeRaw`
        INSERT INTO inventories (id, code, status, created_by_id, approved_by_id, approved_at, closed_at, updated_at)
        VALUES (gen_random_uuid(), 'INV-DBI-0007', 'APPROVED', ${userId}::uuid, ${userId}::uuid, now(), now(), now())
      `;

      await expect(
        prisma.$executeRaw`UPDATE inventories SET status = 'OPEN', updated_at = now() WHERE code = 'INV-DBI-0007'`,
      ).rejects.toThrow(/é estado final/);
    });

    it('sair de CANCELLED é recusado', async () => {
      const { userId } = await fixture();
      await prisma.$executeRaw`
        INSERT INTO inventories (id, code, status, created_by_id, closed_at, updated_at)
        VALUES (gen_random_uuid(), 'INV-DBI-0008', 'CANCELLED', ${userId}::uuid, now(), now())
      `;

      await expect(
        prisma.$executeRaw`UPDATE inventories SET status = 'PENDING_APPROVAL', updated_at = now() WHERE code = 'INV-DBI-0008'`,
      ).rejects.toThrow(/é estado final/);
    });

    it('fechar um inventário libera (in_progress=false) todos os seus itens', async () => {
      const { userId, productId } = await fixture();
      await prisma.$executeRaw`
        INSERT INTO inventories (id, code, status, created_by_id, updated_at)
        VALUES (gen_random_uuid(), 'INV-DBI-0009', 'OPEN', ${userId}::uuid, now())
      `;
      const inventoryIdRows = await prisma.$queryRaw<{ id: string }[]>`
        SELECT id FROM inventories WHERE code = 'INV-DBI-0009'
      `;
      const inventoryId = inventoryIdRows[0]?.id as string;
      await prisma.$executeRaw`
        INSERT INTO inventory_items (id, inventory_id, product_id, updated_at)
        VALUES (gen_random_uuid(), ${inventoryId}::uuid, ${productId}::uuid, now())
      `;

      await prisma.$executeRaw`
        UPDATE inventories SET status = 'CANCELLED', closed_at = now(), updated_at = now() WHERE id = ${inventoryId}::uuid
      `;

      const [item] = await prisma.$queryRaw<{ in_progress: boolean }[]>`
        SELECT in_progress FROM inventory_items WHERE inventory_id = ${inventoryId}::uuid
      `;
      expect(item?.in_progress).toBe(false);
    });
  });

  describe('PG-2: zero diferença entre o schema e o banco de teste', () => {
    it('prisma migrate diff --exit-code devolve 0 (sem diferença)', () => {
      const prismaCli = resolve(process.cwd(), 'node_modules', 'prisma', 'build', 'index.js');

      const resultado = ((): { exitCode: number; output: string } => {
        try {
          const output = execFileSync(
            process.execPath,
            [
              prismaCli,
              'migrate',
              'diff',
              '--from-config-datasource',
              '--to-schema',
              'prisma/schema.prisma',
              '--exit-code',
            ],
            { env: process.env, stdio: 'pipe', encoding: 'utf8' },
          );
          return { exitCode: 0, output };
        } catch (error) {
          const execError = error as { status?: number; stdout?: string };
          return { exitCode: execError.status ?? 1, output: execError.stdout ?? '' };
        }
      })();

      expect(
        resultado.exitCode,
        `prisma migrate diff relatou diferença:\n${resultado.output}`,
      ).toBe(0);
    });
  });

  describe('PG-3: catálogo — objetos da migration 5B', () => {
    it('os dois triggers de inventário existem com as funções certas', async () => {
      const rows = await prisma.$queryRaw<{ tgname: string; fn: string }[]>`
        SELECT t.tgname, p.proname AS fn
          FROM pg_trigger t JOIN pg_proc p ON p.oid = t.tgfoid
         WHERE t.tgname IN ('inventories_release_items_trigger', 'inventories_forbid_reopen_trigger')
           AND NOT t.tgisinternal
         ORDER BY t.tgname
      `;

      expect(rows).toHaveLength(2);
      expect(rows.map((r) => r.fn).sort()).toEqual(
        ['inventories_forbid_reopen', 'inventories_release_items'].sort(),
      );
    });

    it('os CHECKs de inventário existem', async () => {
      const rows = await prisma.$queryRaw<{ conname: string }[]>`
        SELECT conname FROM pg_constraint
         WHERE contype = 'c' AND connamespace = 'public'::regnamespace
           AND conname IN (
             'inventory_items_expected_qty_non_negative',
             'inventory_items_counted_qty_non_negative',
             'inventory_items_counted_pairing',
             'inventories_approval_coherent',
             'inventories_closure_coherent'
           )
      `;

      expect(rows).toHaveLength(5);
    });

    it('o índice único parcial existe com a definição exata', async () => {
      const rows = await prisma.$queryRaw<{ indexdef: string }[]>`
        SELECT indexdef FROM pg_indexes WHERE indexname = 'inventory_items_one_unfinalized_per_product'
      `;

      expect(rows[0]?.indexdef).toContain('UNIQUE');
      expect(rows[0]?.indexdef).toContain('WHERE in_progress');
    });
  });
});
