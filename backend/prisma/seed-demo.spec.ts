import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { assertDemoSeedConfig, validateDemoPassword } from './seed-demo';

const DEMO_DB_URL =
  'postgresql://neondb_owner:segredo_neon@ep-demo.us-east-2.aws.neon.tech/stockflow_demo?sslmode=require';
const TEST_DB_URL = 'postgresql://stockflow:senha@localhost:5432/stockflow_test?schema=public';
const E2E_DB_URL = 'postgresql://stockflow:senha@localhost:5432/stockflow_e2e?schema=public';

describe('assertDemoSeedConfig e validateDemoPassword (Fase 8 — segurança do seed de demonstração)', () => {
  it('recusa quando ALLOW_DEMO_SEED não é explicitamente "true"', () => {
    expect(() =>
      assertDemoSeedConfig({
        DATABASE_URL: DEMO_DB_URL,
        DEMO_ADMIN_PASSWORD: 'Demo@Admin#2026!StockFlow',
        DEMO_MANAGER_PASSWORD: 'Demo@Manager#2026!StockFlow',
        DEMO_OPERATOR_PASSWORD: 'Demo@Operator#2026!StockFlow',
      }),
    ).toThrow(/ALLOW_DEMO_SEED deve ser explicitamente "true"/);

    expect(() =>
      assertDemoSeedConfig({
        ALLOW_DEMO_SEED: 'false',
        DATABASE_URL: DEMO_DB_URL,
        DEMO_ADMIN_PASSWORD: 'Demo@Admin#2026!StockFlow',
        DEMO_MANAGER_PASSWORD: 'Demo@Manager#2026!StockFlow',
        DEMO_OPERATOR_PASSWORD: 'Demo@Operator#2026!StockFlow',
      }),
    ).toThrow(/ALLOW_DEMO_SEED deve ser explicitamente "true"/);
  });

  it('recusa bancos de integração (stockflow_test) e E2E (stockflow_e2e) sem vazar credenciais', () => {
    for (const forbiddenUrl of [TEST_DB_URL, E2E_DB_URL]) {
      try {
        assertDemoSeedConfig({
          ALLOW_DEMO_SEED: 'true',
          DATABASE_URL: forbiddenUrl,
          DEMO_ADMIN_PASSWORD: 'Demo@Admin#2026!StockFlow',
          DEMO_MANAGER_PASSWORD: 'Demo@Manager#2026!StockFlow',
          DEMO_OPERATOR_PASSWORD: 'Demo@Operator#2026!StockFlow',
        });
        expect.unreachable('deveria ter recusado banco de teste/E2E');
      } catch (error) {
        const message = (error as Error).message;
        expect(message).toMatch(/bancos de teste\/E2E têm ciclo de vida próprio/);
        expect(message).not.toContain('senha');
        expect(message).toContain(':***@');
      }
    }
  });

  it('recusa senhas ausentes, curtas (< 10 caracteres) ou triviais', () => {
    expect(() => validateDemoPassword('', 'DEMO_ADMIN_PASSWORD')).toThrow(/não definida/);
    expect(() => validateDemoPassword('curta123', 'DEMO_ADMIN_PASSWORD')).toThrow(
      /O mínimo exigido pela política/,
    );
    expect(() => validateDemoPassword('1234567890', 'DEMO_ADMIN_PASSWORD')).toThrow(
      /valor trivial bloqueado/,
    );
    expect(() => validateDemoPassword('Password123', 'DEMO_ADMIN_PASSWORD')).toThrow(
      /valor trivial bloqueado/,
    );
  });

  it('prioriza DIRECT_URL sobre DATABASE_URL quando ambas estão definidas e aceita configuração válida', () => {
    const directUrl =
      'postgresql://neondb_owner:segredo_neon@ep-direct.us-east-2.aws.neon.tech/stockflow?sslmode=require';
    const result = assertDemoSeedConfig({
      ALLOW_DEMO_SEED: 'true',
      DATABASE_URL: DEMO_DB_URL,
      DIRECT_URL: directUrl,
      DEMO_ADMIN_PASSWORD: 'Demo@Admin#2026!StockFlow',
      DEMO_MANAGER_PASSWORD: 'Demo@Manager#2026!StockFlow',
      DEMO_OPERATOR_PASSWORD: 'Demo@Operator#2026!StockFlow',
    });

    expect(result.connectionString).toBe(directUrl);
    expect(result.passwords).toEqual({
      admin: 'Demo@Admin#2026!StockFlow',
      manager: 'Demo@Manager#2026!StockFlow',
      operator: 'Demo@Operator#2026!StockFlow',
    });
  });

  it('execução direta do script recusa com exit code 1 quando ALLOW_DEMO_SEED não está ativa', () => {
    const backendDir = resolve(__dirname, '..');
    const tsxCli = resolve(backendDir, 'node_modules', 'tsx', 'dist', 'cli.mjs');
    const scriptPath = resolve(__dirname, 'seed-demo.ts');

    const result = spawnSync(process.execPath, [tsxCli, scriptPath], {
      cwd: backendDir,
      env: {
        ...process.env,
        ALLOW_DEMO_SEED: 'false',
        DATABASE_URL: 'postgresql://stockflow:segredo_oculto@127.0.0.1:1/stockflow',
      },
      encoding: 'utf-8',
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/ALLOW_DEMO_SEED deve ser explicitamente "true"/);
    expect(result.stderr).not.toContain('segredo_oculto');
  }, 20_000);
});
