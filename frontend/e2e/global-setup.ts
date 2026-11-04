import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { config as loadEnv } from 'dotenv';

/**
 * Prepara o banco E2E antes de qualquer teste do Playwright rodar (Marco 7A).
 *
 * Mesmo padrão de `backend/test/global-setup.ts`: aplica migration, limpa o
 * banco e semeia os dados fictícios, tudo chamando o CLI por caminho direto
 * com `env` explícito — nunca por interpolação de variável num comando de
 * shell, que tem sintaxe diferente em cmd.exe e em um shell POSIX.
 *
 * As três travas de segurança que importam aqui:
 *   1. `DATABASE_URL_E2E` precisa existir;
 *   2. precisa ter "e2e" no nome;
 *   3. precisa ser DIFERENTE de `DATABASE_URL` (desenvolvimento) e de
 *      `DATABASE_URL_TEST` (integração) — sem isto, um erro de configuração
 *      no `.env` apagaria dados de um dos outros dois.
 */
const REPO_ROOT = resolve(import.meta.dirname, '../..');
const BACKEND_DIR = resolve(REPO_ROOT, 'backend');

/** Oculta a senha ao citar a URL rejeitada numa mensagem de erro. */
function redact(url: string): string {
  return url.replace(/:[^:@/]+@/, ':***@');
}

/**
 * Extrai exclusivamente o nome do banco a partir do `pathname` da URL Postgres.
 *
 * Validar `/e2e/i` na URL inteira seria inseguro: uma senha, usuário, host ou
 * query string contendo "e2e" (ex.: `postgresql://user:senha_e2e@localhost:5432/stockflow`)
 * passaria no regex mesmo apontando para o banco de desenvolvimento.
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
 * As travas de segurança do isolamento do banco E2E, como função pura
 * — sem ler arquivo, sem variável de ambiente global, só os três valores
 * recebidos. É o que permite provar a recusa com strings sintéticas num
 * teste (`global-setup.unit.test.ts`), sem precisar de um `.env` real nem de
 * nenhum banco no ar: o teste não executa I/O nenhum, só chama esta função.
 *
 *   1. `DATABASE_URL_E2E` precisa existir e ser uma URL Postgres válida;
 *   2. o NOME DO BANCO (extraído do `pathname`, nunca da senha/usuário/query)
 *      não pode ser `stockflow` nem `stockflow_test` e precisa conter "e2e";
 *   3. precisa ser DIFERENTE de `DATABASE_URL` (desenvolvimento) e de
 *      `DATABASE_URL_TEST` (integração), tanto na string completa quanto no
 *      nome do banco extraído (evita contorno por diferença de query string
 *      ou host equivalente).
 */
export function selectE2eDatabaseUrl(env: {
  DATABASE_URL_E2E?: string | undefined;
  DATABASE_URL?: string | undefined;
  DATABASE_URL_TEST?: string | undefined;
}): string {
  const e2eUrl = env.DATABASE_URL_E2E?.trim();

  if (!e2eUrl) {
    throw new Error('DATABASE_URL_E2E não definida. Veja .env.example.');
  }

  const e2eDbName = extractDatabaseName(e2eUrl);
  const normalizedE2eDb = e2eDbName.toLowerCase();

  if (FORBIDDEN_DB_NAMES.has(normalizedE2eDb) || !/e2e/i.test(e2eDbName)) {
    throw new Error(
      `DATABASE_URL_E2E deve apontar para um banco com "e2e" no nome (recebido banco "${e2eDbName}" em ${redact(e2eUrl)}).`,
    );
  }

  const devDbName = tryExtractDatabaseName(env.DATABASE_URL);
  const testDbName = tryExtractDatabaseName(env.DATABASE_URL_TEST);

  if (
    e2eUrl === env.DATABASE_URL ||
    e2eUrl === env.DATABASE_URL_TEST ||
    (devDbName !== undefined && normalizedE2eDb === devDbName) ||
    (testDbName !== undefined && normalizedE2eDb === testDbName)
  ) {
    throw new Error(
      'DATABASE_URL_E2E aponta para o mesmo banco que DATABASE_URL ou DATABASE_URL_TEST. ' +
        'A suíte E2E recusa rodar: isso apagaria dados de desenvolvimento ou de integração.',
    );
  }

  return e2eUrl;
}

/** Carrega o `.env` real e aplica `selectE2eDatabaseUrl` — o único ponto de I/O. */
export function resolveE2eDatabaseUrl(sourceEnv: NodeJS.ProcessEnv = process.env): string {
  if (sourceEnv === process.env) {
    loadEnv({ path: resolve(REPO_ROOT, '.env'), override: false, quiet: true });
  }

  return selectE2eDatabaseUrl({
    DATABASE_URL_E2E: sourceEnv['DATABASE_URL_E2E'],
    DATABASE_URL: sourceEnv['DATABASE_URL'],
    DATABASE_URL_TEST: sourceEnv['DATABASE_URL_TEST'],
  });
}

export type CommandRunner = (args: string[], env: NodeJS.ProcessEnv) => void;

function defaultRun(args: string[], env: NodeJS.ProcessEnv): void {
  execFileSync(process.execPath, args, { cwd: BACKEND_DIR, env, stdio: 'inherit' });
}

export function runGlobalSetup(
  sourceEnv: NodeJS.ProcessEnv = process.env,
  run: CommandRunner = defaultRun,
): void {
  const e2eUrl = resolveE2eDatabaseUrl(sourceEnv);
  const backendBin = resolve(BACKEND_DIR, 'node_modules', '.bin');

  // `prisma db seed` resolve o comando do seed (`tsx prisma/seed.ts`) via
  // PATH, não pelo caminho do próprio processo Node que o invoca — sem isto,
  // o comando falha com "'tsx' não é reconhecido" porque `node_modules/.bin`
  // do backend não está no PATH deste processo. No Windows a variável pode
  // estar como `Path` (e não `PATH`) no ambiente herdado, então as duas
  // grafias são escritas para não depender de qual delas já existia.
  const separator = process.platform === 'win32' ? ';' : ':';
  const existingPath = sourceEnv['PATH'] ?? sourceEnv['Path'] ?? '';
  const pathWithBackendBin = `${backendBin}${separator}${existingPath}`;

  // Preserva `DATABASE_URL_DEV` para que `e2e-reset-db.ts` também possa
  // conferir que o alvo não coincide com o banco de desenvolvimento, mesmo
  // após `DATABASE_URL` ser sobrescrita para o CLI do Prisma.
  const env: NodeJS.ProcessEnv = {
    ...sourceEnv,
    DATABASE_URL_DEV: sourceEnv['DATABASE_URL'],
    DATABASE_URL_E2E: e2eUrl,
    DATABASE_URL: e2eUrl,
    NODE_ENV: 'test',
    PATH: pathWithBackendBin,
    Path: pathWithBackendBin,
  };

  const prismaCli = resolve(BACKEND_DIR, 'node_modules', 'prisma', 'build', 'index.js');
  const tsx = resolve(BACKEND_DIR, 'node_modules', 'tsx', 'dist', 'cli.mjs');

  console.log('[e2e] aplicando migrations no banco E2E…');
  run([prismaCli, 'migrate', 'deploy'], env);

  console.log('[e2e] limpando o banco E2E…');
  run([tsx, 'scripts/e2e-reset-db.ts'], env);

  console.log('[e2e] semeando dados fictícios…');
  run([prismaCli, 'db', 'seed'], env);
}

export default function globalSetup(): void {
  runGlobalSetup();
}
