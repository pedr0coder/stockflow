/**
 * Configuração do Prisma CLI (Prisma 7).
 *
 * Duas mudanças do Prisma 7 que este arquivo resolve:
 *   1. a URL do banco saiu do `schema.prisma` e passou a morar aqui;
 *   2. o CLI deixou de carregar `.env` sozinho, então o `dotenv` abaixo é
 *      obrigatório, não decorativo.
 *
 * O `.env` fica na RAIZ do repositório, não em `backend/`: um único arquivo de
 * ambiente serve o docker-compose, o backend e o frontend, e duas cópias de um
 * arquivo de segredo divergem em uma semana. `override: false` garante que
 * variável já exportada no ambiente (container, CI) vence o arquivo.
 *
 * A aplicação NestJS não usa este arquivo: ela valida o ambiente no boot
 * (src/config/env.validation.ts) e recusa subir com configuração inválida.
 * Aqui é só o CLI: `migrate`, `db`, `studio`.
 *
 * Para apontar um comando ao banco de teste:
 *   DATABASE_URL="$DATABASE_URL_TEST" npx prisma migrate deploy
 */
import { resolve } from 'node:path';
import { config as loadEnv } from 'dotenv';
import { defineConfig } from 'prisma/config';

loadEnv({ path: resolve(import.meta.dirname, '../.env'), override: false, quiet: true });

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    // Em produção com Neon PostgreSQL (Fase 8), `DIRECT_URL` aponta para a
    // conexão direta (sem PgBouncer) recomendada para DDL (`prisma migrate deploy`),
    // enquanto `DATABASE_URL` pode usar o endpoint `-pooler`. Em desenvolvimento
    // e no CI, `DIRECT_URL` é omitida e `DATABASE_URL` continua sendo usada.
    url: process.env['DIRECT_URL'] ?? process.env['DATABASE_URL'],
  },
});
