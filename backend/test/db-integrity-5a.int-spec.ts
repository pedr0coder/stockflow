import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { NestExpressApplication } from '@nestjs/platform-express';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp, truncateAll, type TestApp } from './helpers/app';

/**
 * Integridade de banco da migration `phase5a_stock_integrity`
 * (docs/17-plano-fase-5.md §17.8.2) e compatibilidade com o Prisma (§17.8.5,
 * guardas PG-2 e PG-3).
 *
 * Todas as asserções aqui são por SQL direto, não pela API: o que está sob
 * teste é o banco, não o service.
 */
describe('Integridade de banco — Fase 5A (integração)', () => {
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

  async function produtoEUsuario(): Promise<{ userId: string; productId: string }> {
    const userId = '0199a000-0000-7000-8000-0000000000a1';
    const categoryId = '0199a000-0000-7000-8000-0000000000c1';
    const productId = '0199a000-0000-7000-8000-0000000000b1';

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

    return { userId, productId };
  }

  describe('DBI: os 5 CHECK da Fase 2 continuam presentes, uma vez cada', () => {
    it('nenhum foi duplicado nem removido pela migration da Fase 5A', async () => {
      const rows = await prisma.$queryRaw<{ conname: string; n: bigint }[]>`
        SELECT conname, count(*) AS n FROM pg_constraint
         WHERE contype = 'c' AND connamespace = 'public'::regnamespace
           AND conname IN (
             'products_current_stock_non_negative',
             'products_min_stock_non_negative',
             'products_unit_cost_non_negative',
             'stock_movements_quantity_positive',
             'stock_movements_stock_after_non_negative'
           )
         GROUP BY conname
      `;

      expect(rows).toHaveLength(5);
      expect(rows.every((r) => Number(r.n) === 1)).toBe(true);
    });
  });

  describe('DBI: CHECKs novos recusam movimento incoerente', () => {
    it('recusa IN com stock_after != stock_before + quantity', async () => {
      const { userId, productId } = await produtoEUsuario();

      await expect(
        prisma.$executeRaw`
          INSERT INTO stock_movements (id, product_id, type, reason, quantity, stock_before, stock_after, user_id)
          VALUES (gen_random_uuid(), ${productId}::uuid, 'IN', 'PURCHASE', 5, 10, 14, ${userId}::uuid)
        `,
      ).rejects.toThrow(/stock_movements_balance_coherent/);
    });

    it('recusa OUT com stock_after != stock_before - quantity', async () => {
      const { userId, productId } = await produtoEUsuario();

      await expect(
        prisma.$executeRaw`
          INSERT INTO stock_movements (id, product_id, type, reason, quantity, stock_before, stock_after, user_id)
          VALUES (gen_random_uuid(), ${productId}::uuid, 'OUT', 'SALE', 5, 10, 6, ${userId}::uuid)
        `,
      ).rejects.toThrow(/stock_movements_balance_coherent/);
    });

    it('recusa ADJUSTMENT sem efeito (stock_after == stock_before)', async () => {
      const { userId, productId } = await produtoEUsuario();

      await expect(
        prisma.$executeRaw`
          INSERT INTO stock_movements (id, product_id, type, reason, quantity, stock_before, stock_after, user_id)
          VALUES (gen_random_uuid(), ${productId}::uuid, 'ADJUSTMENT', 'CORRECTION', 1, 10, 10, ${userId}::uuid)
        `,
      ).rejects.toThrow(/stock_movements_balance_coherent/);
    });

    it('recusa ADJUSTMENT com magnitude errada', async () => {
      const { userId, productId } = await produtoEUsuario();

      await expect(
        prisma.$executeRaw`
          INSERT INTO stock_movements (id, product_id, type, reason, quantity, stock_before, stock_after, user_id)
          VALUES (gen_random_uuid(), ${productId}::uuid, 'ADJUSTMENT', 'CORRECTION', 9, 10, 7, ${userId}::uuid)
        `,
      ).rejects.toThrow(/stock_movements_balance_coherent/);
    });

    it('recusa motivo incompatível com o tipo (OUT com PURCHASE)', async () => {
      const { userId, productId } = await produtoEUsuario();

      await expect(
        prisma.$executeRaw`
          INSERT INTO stock_movements (id, product_id, type, reason, quantity, stock_before, stock_after, user_id)
          VALUES (gen_random_uuid(), ${productId}::uuid, 'OUT', 'PURCHASE', 5, 10, 5, ${userId}::uuid)
        `,
      ).rejects.toThrow(/stock_movements_type_reason_coherent/);
    });

    it('aceita um movimento coerente', async () => {
      const { userId, productId } = await produtoEUsuario();

      await expect(
        prisma.$executeRaw`
          INSERT INTO stock_movements (id, product_id, type, reason, quantity, stock_before, stock_after, user_id)
          VALUES (gen_random_uuid(), ${productId}::uuid, 'OUT', 'SALE', 3, 10, 7, ${userId}::uuid)
        `,
      ).resolves.not.toThrow();
    });
  });

  describe('DBI: imutabilidade garantida pelo banco (trigger, SQLSTATE SF001)', () => {
    it('UPDATE é recusado', async () => {
      const { userId, productId } = await produtoEUsuario();
      await prisma.$executeRaw`
        INSERT INTO stock_movements (id, product_id, type, reason, quantity, stock_before, stock_after, user_id)
        VALUES (gen_random_uuid(), ${productId}::uuid, 'OUT', 'SALE', 3, 10, 7, ${userId}::uuid)
      `;

      await expect(
        prisma.$executeRaw`UPDATE stock_movements SET note = 'adulterado' WHERE product_id = ${productId}::uuid`,
      ).rejects.toThrow(/imutável/);
    });

    it('DELETE é recusado', async () => {
      const { userId, productId } = await produtoEUsuario();
      await prisma.$executeRaw`
        INSERT INTO stock_movements (id, product_id, type, reason, quantity, stock_before, stock_after, user_id)
        VALUES (gen_random_uuid(), ${productId}::uuid, 'OUT', 'SALE', 3, 10, 7, ${userId}::uuid)
      `;

      await expect(
        prisma.$executeRaw`DELETE FROM stock_movements WHERE product_id = ${productId}::uuid`,
      ).rejects.toThrow(/imutável/);
    });

    it('TRUNCATE continua livre (é o que a suíte usa entre casos)', async () => {
      const { userId, productId } = await produtoEUsuario();
      await prisma.$executeRaw`
        INSERT INTO stock_movements (id, product_id, type, reason, quantity, stock_before, stock_after, user_id)
        VALUES (gen_random_uuid(), ${productId}::uuid, 'OUT', 'SALE', 3, 10, 7, ${userId}::uuid)
      `;

      await expect(
        prisma.$executeRawUnsafe('TRUNCATE stock_movements RESTART IDENTITY CASCADE'),
      ).resolves.not.toThrow();
    });
  });

  /**
   * PG-2: o Prisma não vê diferença entre o banco de teste (já com a
   * migration 5A e o índice trigram declarado — D19) e o schema.
   *
   * Roda o MESMO comando que `globalSetup` usa para `migrate deploy`, então
   * se um `migrate dev` futuro tentasse remover o índice trigram ou os
   * objetos da migration, este teste pega antes do CI.
   */
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

  /**
   * PG-3: catálogo. O índice único parcial da Fase 5B e os triggers dela
   * ainda NÃO existem neste marco — isto é o inventário do que o 5A criou.
   */
  describe('PG-3: catálogo — objetos da migration 5A', () => {
    it('o trigger de imutabilidade existe com a função certa', async () => {
      const rows = await prisma.$queryRaw<{ tgname: string; fn: string }[]>`
        SELECT t.tgname, p.proname AS fn
          FROM pg_trigger t JOIN pg_proc p ON p.oid = t.tgfoid
         WHERE t.tgname = 'stock_movements_immutable' AND NOT t.tgisinternal
      `;

      expect(rows).toHaveLength(1);
      expect(rows[0]?.fn).toBe('stock_movements_forbid_change');
    });

    it('os dois CHECKs novos existem', async () => {
      const rows = await prisma.$queryRaw<{ conname: string }[]>`
        SELECT conname FROM pg_constraint
         WHERE contype = 'c' AND connamespace = 'public'::regnamespace
           AND conname IN ('stock_movements_balance_coherent', 'stock_movements_type_reason_coherent')
      `;

      expect(rows.map((r) => r.conname).sort()).toEqual(
        ['stock_movements_balance_coherent', 'stock_movements_type_reason_coherent'].sort(),
      );
    });

    it('o índice GIN trigram declarado no schema (D19) é o mesmo objeto físico de sempre', async () => {
      const rows = await prisma.$queryRaw<{ indexdef: string }[]>`
        SELECT indexdef FROM pg_indexes WHERE indexname = 'products_name_trgm_idx'
      `;

      expect(rows[0]?.indexdef).toContain('gin');
      expect(rows[0]?.indexdef).toContain('gin_trgm_ops');
    });
  });
});
