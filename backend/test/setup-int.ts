import { resolve } from 'node:path';
import { config as loadEnv } from 'dotenv';

/**
 * Preparação do ambiente da suíte de integração.
 *
 * Roda uma vez por processo de teste, antes de qualquer arquivo de teste.
 */
// cwd da suíte é backend/, então o .env da raiz do repositório é um nível acima.
// Resolver por cwd em vez de import.meta mantém o arquivo compilável como
// CommonJS, que é o módulo de saída do backend (tsconfig.json).
loadEnv({ path: resolve(process.cwd(), '../.env'), override: false, quiet: true });

const testUrl = process.env['DATABASE_URL_TEST'];

if (!testUrl) {
  throw new Error(
    'DATABASE_URL_TEST não definida. A suíte de integração não roda contra o banco de desenvolvimento.',
  );
}

/**
 * Trava de segurança.
 *
 * A suíte trunca tabelas entre os casos. Se `DATABASE_URL_TEST` apontasse, por
 * engano de configuração, para o banco de desenvolvimento, uma única execução
 * apagaria o trabalho do dia. Exigir "test" no nome do banco é barato e fecha
 * essa porta.
 */
if (!/test/i.test(testUrl)) {
  throw new Error(
    `DATABASE_URL_TEST deve apontar para um banco com "test" no nome. Recebido: ${testUrl.replace(/:[^:@]+@/, ':***@')}`,
  );
}

process.env['DATABASE_URL'] = testUrl;
process.env['NODE_ENV'] = 'test';
// Log de teste só atrapalha a leitura da falha. Erro continua visível.
process.env['LOG_LEVEL'] = 'error';
