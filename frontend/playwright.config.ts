import { resolve } from 'node:path';
import { config as loadEnv } from 'dotenv';
import { defineConfig, devices } from '@playwright/test';
import { selectE2eDatabaseUrl } from './e2e/global-setup';

/**
 * Suíte E2E (Marco 7A, docs/19-plano-fase-7.md §19.5).
 *
 * Dois `webServer`: backend real e frontend real, cada um numa porta dedicada
 * (3100/5183) para nunca colidir com `npm run dev` (3000/5173) nem com a
 * suíte de integração. O backend sobe apontado para `DATABASE_URL_E2E`
 * validada ANTES do boot (no Playwright, `webServer` inicia antes de
 * `globalSetup`, então validar aqui impede até mesmo abrir conexão em banco
 * indevido), e `globalSetup` aplica migration, limpa e semeia o banco E2E
 * antes de qualquer teste rodar.
 */
const REPO_ROOT = resolve(import.meta.dirname, '..');
const BACKEND_DIR = resolve(REPO_ROOT, 'backend');

loadEnv({ path: resolve(REPO_ROOT, '.env'), override: false, quiet: true });

const E2E_DATABASE_URL = selectE2eDatabaseUrl({
  DATABASE_URL_E2E: process.env['DATABASE_URL_E2E'],
  DATABASE_URL: process.env['DATABASE_URL'],
  DATABASE_URL_TEST: process.env['DATABASE_URL_TEST'],
});

const BACKEND_PORT = 3100;
const FRONTEND_PORT = 5183;

export default defineConfig({
  testDir: './e2e',
  // Sem isto, o padrão default do Playwright (`*.test.ts` também conta como
  // teste) tentaria carregar `global-setup.unit.test.ts` — que usa
  // `describe`/`it` do Vitest, não do Playwright, e quebra fora do runner
  // certo. Esse arquivo roda só pelo Vitest (ver `vite.config.ts`).
  testMatch: /.*\.spec\.ts$/,
  fullyParallel: false,
  // Um worker só: os dois specs compartilham o mesmo banco E2E, e rodar em
  // paralelo arriscaria sufixos de fixture colidindo no mesmo milissegundo
  // ou poluir contagens agregadas (dashboard) que um dos specs não verifica
  // por produto específico. Só 2 testes hoje — o custo de serializar é baixo.
  workers: 1,
  forbidOnly: !!process.env['CI'],
  retries: 0,
  // Sem retry automático de propósito: o plano da Fase 7 (§19.6.1) rejeita
  // retry como substituto de correção, inclusive para instabilidade de teste.
  // Uma falha de E2E deve aparecer, não ser mascarada por uma segunda tentativa.
  reporter: [['html', { open: 'never' }], ['list']],
  globalSetup: './e2e/global-setup.ts',

  use: {
    baseURL: `http://localhost:${String(FRONTEND_PORT)}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },

  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],

  webServer: [
    {
      command: `node node_modules/@nestjs/cli/bin/nest.js start`,
      cwd: BACKEND_DIR,
      url: `http://localhost:${String(BACKEND_PORT)}/api/v1/health/ready`,
      reuseExistingServer: false,
      timeout: 60_000,
      env: {
        ...process.env,
        NODE_ENV: 'test',
        PORT: String(BACKEND_PORT),
        DATABASE_URL: E2E_DATABASE_URL,
        CORS_ORIGINS: `http://localhost:${String(FRONTEND_PORT)}`,
        LOG_LEVEL: 'warn',
      },
    },
    {
      command: `node node_modules/vite/bin/vite.js --port ${String(FRONTEND_PORT)}`,
      cwd: resolve(REPO_ROOT, 'frontend'),
      url: `http://localhost:${String(FRONTEND_PORT)}`,
      reuseExistingServer: false,
      timeout: 30_000,
      env: {
        ...process.env,
        VITE_PROXY_TARGET: `http://localhost:${String(BACKEND_PORT)}`,
      },
    },
  ],
});
