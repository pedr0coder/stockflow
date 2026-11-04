/**
 * Limpa o banco da suíte E2E antes de rodar o seed (Marco 7A).
 *
 * Roda ANTES de `prisma db seed`, não em vez dele: o seed é idempotente por
 * `upsert`, mas movimentações, inventários e ajustes criados pelos próprios
 * testes E2E em uma execução anterior não desaparecem com um `upsert` — só um
 * truncate garante que cada execução parte do mesmo estado.
 *
 * Trava de segurança **própria e independente** da de `frontend/e2e/global-setup.ts`
 * — de propósito. Este script é chamado por `global-setup.ts`, mas também pode
 * ser invocado diretamente (`tsx scripts/e2e-reset-db.ts`, por engano ou em
 * depuração manual). Se a validação vivesse só do lado do chamador, rodar este
 * arquivo direto contornaria a proteção inteira. `assertE2eDatabaseUrl` roda
 * como a PRIMEIRA linha de `main()`, antes de qualquer import de conexão ser
 * instanciado — a validação não pode ser pulada nem adiada.
 */
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';

/** Oculta a senha ao citar a URL rejeitada numa mensagem de erro. */
function redact(url: string): string {
  return url.replace(/:[^:@/]+@/, ':***@');
}

/**
 * Extrai exclusivamente o nome do banco a partir do `pathname` da URL Postgres.
 *
 * Testar `/e2e/i` na string inteira da URL permitiria que uma senha, usuário
 * ou query string com "e2e" passasse na validação mesmo apontando para
 * `stockflow` (dev) ou `stockflow_test` (integração).
 */
export function extractDatabaseName(connectionString: string): string {
  let parsed: URL;

  try {
    parsed = new URL(connectionString);
  } catch {
    throw new Error(`URL de banco inválida: ${redact(connectionString)}`);
  }

  if (parsed.protocol !== 'postgresql:' && parsed.protocol !== 'postgres:') {
    throw new Error(`Protocolo de banco inválido em: ${redact(connectionString)}`);
  }

  const dbName = decodeURIComponent(parsed.pathname.replace(/^\/+/, '')).trim();

  if (!dbName || dbName.includes('/')) {
    throw new Error(`Nome do banco ausente na URL: ${redact(connectionString)}`);
  }

  return dbName;
}

function tryExtractDatabaseName(connectionString: string | undefined): string | undefined {
  if (!connectionString) {
    return undefined;
  }

  try {
    return extractDatabaseName(connectionString).toLowerCase();
  } catch {
    return undefined;
  }
}

const FORBIDDEN_DB_NAMES = new Set(['stockflow', 'stockflow_test']);

/**
 * Valida que `DATABASE_URL` aponta para o banco E2E — nunca para o de
 * desenvolvimento nem para o de integração.
 *
 * Função pura, sem I/O: recebe os valores de ambiente relevantes e só
 * retorna a URL validada ou lança. Isso é o que permite testar a recusa com
 * strings sintéticas, sem abrir nenhuma conexão real nem precisar de um
 * banco de verdade no ar (docs/19-plano-fase-7.md §19.5.1, item de validação
 * do isolamento do Marco 7A).
 *
 * Verificações, nesta ordem, cada uma suficiente sozinha para recusar:
 *   1. a variável existe e é uma URL Postgres válida;
 *   2. o NOME DO BANCO (extraído do `pathname`) não é `stockflow` nem
 *      `stockflow_test` e contém "e2e";
 *   3. é diferente de `DATABASE_URL_TEST` e `DATABASE_URL_DEV` (tanto na
 *      string completa quanto no nome do banco extraído);
 *   4. se `DATABASE_URL_E2E` estiver presente no ambiente, `DATABASE_URL`
 *      precisa apontar para o mesmo banco que `DATABASE_URL_E2E` (impede que
 *      uma execução direta com `.env` carregado use o `DATABASE_URL` de dev).
 */
export function assertE2eDatabaseUrl(env: {
  DATABASE_URL?: string | undefined;
  DATABASE_URL_TEST?: string | undefined;
  DATABASE_URL_DEV?: string | undefined;
  DATABASE_URL_E2E?: string | undefined;
}): string {
  const connectionString = env.DATABASE_URL?.trim();

  if (!connectionString) {
    throw new Error('DATABASE_URL não definida.');
  }

  const dbName = extractDatabaseName(connectionString);
  const normalizedDb = dbName.toLowerCase();

  if (FORBIDDEN_DB_NAMES.has(normalizedDb) || !/e2e/i.test(dbName)) {
    throw new Error(
      `DATABASE_URL deve apontar para um banco com "e2e" no nome (recebido banco "${dbName}" em ${redact(connectionString)}).`,
    );
  }

  const testDbName = tryExtractDatabaseName(env.DATABASE_URL_TEST);
  if (
    connectionString === env.DATABASE_URL_TEST ||
    (testDbName !== undefined && normalizedDb === testDbName)
  ) {
    throw new Error(
      'DATABASE_URL é igual a DATABASE_URL_TEST (banco de integração). ' +
        'Recusado: isto apagaria dados da suíte de integração.',
    );
  }

  const devDbName = tryExtractDatabaseName(env.DATABASE_URL_DEV);
  if (
    connectionString === env.DATABASE_URL_DEV ||
    (devDbName !== undefined && normalizedDb === devDbName)
  ) {
    throw new Error(
      'DATABASE_URL é igual a DATABASE_URL_DEV (banco de desenvolvimento). ' +
        'Recusado: isto apagaria dados de desenvolvimento.',
    );
  }

  const e2eDbName = tryExtractDatabaseName(env.DATABASE_URL_E2E);
  if (env.DATABASE_URL_E2E && e2eDbName !== undefined && normalizedDb !== e2eDbName) {
    throw new Error(
      'DATABASE_URL diverge de DATABASE_URL_E2E. ' +
        'Recusado: o reset só pode operar sobre o banco configurado em DATABASE_URL_E2E.',
    );
  }

  return connectionString;
}

async function main(): Promise<void> {
  // Primeira linha executável de propósito — nada de conexão é construído
  // antes desta checagem.
  const connectionString = assertE2eDatabaseUrl({
    DATABASE_URL: process.env['DATABASE_URL'],
    DATABASE_URL_TEST: process.env['DATABASE_URL_TEST'],
    DATABASE_URL_DEV: process.env['DATABASE_URL_DEV'],
    DATABASE_URL_E2E: process.env['DATABASE_URL_E2E'],
  });

  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

  try {
    await prisma.$executeRawUnsafe(`
      TRUNCATE TABLE
        audit_logs, refresh_tokens, stock_movements, inventory_items,
        inventories, products, categories, suppliers, users
      RESTART IDENTITY CASCADE
    `);
    console.log('banco E2E limpo.');
  } finally {
    await prisma.$disconnect();
  }
}

// `require.main === module` identifica execução direta
// (`tsx scripts/e2e-reset-db.ts`) e não via `import`/`require` de outro
// módulo — relevante só para o teste unitário deste arquivo, que importa
// `assertE2eDatabaseUrl` sem querer disparar `main()` nem abrir conexão
// nenhuma. Idioma do CommonJS, e não `import.meta.url`: o `tsconfig.json`
// deste projeto compila para CommonJS (sem `"type": "module"` no
// `package.json`), onde `import.meta` nem é uma sintaxe válida.
const isDirectExecution = require.main === module;

if (isDirectExecution) {
  main().catch((error: unknown) => {
    console.error('Falha ao limpar o banco E2E:');
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
