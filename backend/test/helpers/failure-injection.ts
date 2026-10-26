import type { PrismaService } from '../../src/prisma/prisma.service';

/**
 * Injeção de falha REAL no banco, para provar atomicidade
 * (docs/17-plano-fase-5.md §17.7.4, AT-1 a AT-3, AT-8, AT-9).
 *
 * Cria um trigger que lança exceção no INSERT de uma tabela, roda a função
 * dada, e remove o trigger em `finally` — mesmo que o teste falhe, para não
 * vazar para os casos seguintes.
 */

type FailableTable = 'stock_movements' | 'audit_logs';

function names(table: FailableTable): { fn: string; trigger: string } {
  return { fn: `test_fail_insert_${table}`, trigger: `test_fail_insert_${table}_trg` };
}

export async function withInsertFailure(
  prisma: PrismaService,
  table: FailableTable,
  run: () => Promise<void>,
): Promise<void> {
  const { fn, trigger } = names(table);

  await prisma.$executeRawUnsafe(`
    CREATE FUNCTION ${fn}() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      RAISE EXCEPTION 'falha injetada para teste (AT)' USING ERRCODE = 'TE001';
    END
    $$
  `);
  await prisma.$executeRawUnsafe(`
    CREATE TRIGGER ${trigger} BEFORE INSERT ON ${table}
      FOR EACH ROW EXECUTE FUNCTION ${fn}()
  `);

  try {
    await run();
  } finally {
    await removeInsertFailure(prisma, table);
  }
}

/** Salvaguarda: remove o trigger de teste mesmo se `withInsertFailure` não tiver sido chamado, ou já tiver limpo. */
export async function removeInsertFailure(
  prisma: PrismaService,
  table: FailableTable,
): Promise<void> {
  const { fn, trigger } = names(table);

  await prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS ${trigger} ON ${table}`);
  await prisma.$executeRawUnsafe(`DROP FUNCTION IF EXISTS ${fn}()`);
}
