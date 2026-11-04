import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { assertE2eDatabaseUrl, extractDatabaseName } from './e2e-reset-db';

/**
 * Prova a recusa do mecanismo de isolamento do banco E2E com strings
 * sintéticas — nenhuma conexão real é aberta, nenhum banco de verdade
 * precisa estar no ar (Marco 7A, validação de isolamento pedida na revisão).
 *
 * `assertE2eDatabaseUrl` é a MESMA função que `main()` chama como primeira
 * linha, antes de qualquer `PrismaClient`/`PrismaPg` ser instanciado — testar
 * esta função isolada e a execução direta do script prova que a checagem roda
 * antes de qualquer operação destrutiva poder começar.
 */

const DEV_URL = 'postgresql://stockflow:senha@localhost:5432/stockflow?schema=public';
const TEST_URL = 'postgresql://stockflow:senha@localhost:5432/stockflow_test?schema=public';
const E2E_URL = 'postgresql://stockflow:senha@localhost:5432/stockflow_e2e?schema=public';
const OUTRO_BANCO_URL = 'postgresql://stockflow:senha@localhost:5432/qualquer_outro?schema=public';

describe('assertE2eDatabaseUrl', () => {
  it('recusa quando DATABASE_URL não está definida', () => {
    expect(() => assertE2eDatabaseUrl({})).toThrow('DATABASE_URL não definida');
  });

  it('recusa o banco de desenvolvimento ("stockflow")', () => {
    expect(() => assertE2eDatabaseUrl({ DATABASE_URL: DEV_URL })).toThrow(
      /deve apontar para um banco com "e2e" no nome/,
    );
  });

  it('recusa o banco de integração ("stockflow_test")', () => {
    expect(() => assertE2eDatabaseUrl({ DATABASE_URL: TEST_URL })).toThrow(
      /deve apontar para um banco com "e2e" no nome/,
    );
  });

  it('recusa qualquer banco fora do padrão esperado, mesmo sem ser dev nem integração', () => {
    expect(() => assertE2eDatabaseUrl({ DATABASE_URL: OUTRO_BANCO_URL })).toThrow(
      /deve apontar para um banco com "e2e" no nome/,
    );
  });

  it('recusa se "e2e" estiver apenas na senha, usuário ou query string enquanto o banco é dev ou test', () => {
    const devComSenhaE2e =
      'postgresql://stockflow:senha_e2e_123@localhost:5432/stockflow?schema=public';
    const testComUserE2e =
      'postgresql://user_e2e:senha@localhost:5432/stockflow_test?schema=public';
    const devComQueryE2e =
      'postgresql://stockflow:senha@localhost:5432/stockflow?application_name=e2e';

    expect(() => assertE2eDatabaseUrl({ DATABASE_URL: devComSenhaE2e })).toThrow(
      /deve apontar para um banco com "e2e" no nome/,
    );
    expect(() => assertE2eDatabaseUrl({ DATABASE_URL: testComUserE2e })).toThrow(
      /deve apontar para um banco com "e2e" no nome/,
    );
    expect(() => assertE2eDatabaseUrl({ DATABASE_URL: devComQueryE2e })).toThrow(
      /deve apontar para um banco com "e2e" no nome/,
    );
  });

  it('recusa mesmo se DATABASE_URL_TEST também não estiver definida (não finge sucesso por omissão)', () => {
    expect(() =>
      assertE2eDatabaseUrl({ DATABASE_URL: DEV_URL, DATABASE_URL_TEST: undefined }),
    ).toThrow();
  });

  it('defesa extra: recusa se DATABASE_URL apontar para o mesmo banco que DATABASE_URL_TEST, mesmo com host, porta ou query diferentes', () => {
    const coincidencia = 'postgresql://stockflow:senha@localhost:5432/e2e_ou_test?schema=public';
    const outroHostSemQuery = 'postgresql://stockflow:senha@127.0.0.1:5432/e2e_ou_test';
    const outraPorta = 'postgresql://stockflow:senha@localhost:15432/e2e_ou_test?connect_timeout=5';

    expect(() =>
      assertE2eDatabaseUrl({ DATABASE_URL: coincidencia, DATABASE_URL_TEST: coincidencia }),
    ).toThrow(/igual a DATABASE_URL_TEST/);
    expect(() =>
      assertE2eDatabaseUrl({
        DATABASE_URL: coincidencia,
        DATABASE_URL_TEST: outroHostSemQuery,
      }),
    ).toThrow(/igual a DATABASE_URL_TEST/);
    expect(() =>
      assertE2eDatabaseUrl({
        DATABASE_URL: coincidencia,
        DATABASE_URL_TEST: outraPorta,
      }),
    ).toThrow(/igual a DATABASE_URL_TEST/);
  });

  it('defesa extra: recusa se DATABASE_URL apontar para o mesmo banco que DATABASE_URL_DEV ou divergir de DATABASE_URL_E2E', () => {
    const coincidenciaDev = 'postgresql://stockflow:senha@localhost:5432/dev_e2e_mix?schema=public';
    const outroE2e = 'postgresql://stockflow:senha@localhost:5432/outro_e2e?schema=public';

    expect(() =>
      assertE2eDatabaseUrl({ DATABASE_URL: coincidenciaDev, DATABASE_URL_DEV: coincidenciaDev }),
    ).toThrow(/igual a DATABASE_URL_DEV/);

    expect(() =>
      assertE2eDatabaseUrl({ DATABASE_URL: outroE2e, DATABASE_URL_E2E: E2E_URL }),
    ).toThrow(/diverge de DATABASE_URL_E2E/);
  });

  it('recusa URL malformada ou protocolo inválido', () => {
    expect(() => assertE2eDatabaseUrl({ DATABASE_URL: 'invalida-e2e' })).toThrow(
      /URL de banco inválida/,
    );
    expect(() => extractDatabaseName('http://localhost:5432/stockflow_e2e')).toThrow(
      /Protocolo de banco inválido/,
    );
  });

  it('a mensagem de erro nunca expõe a senha da URL rejeitada', () => {
    try {
      assertE2eDatabaseUrl({ DATABASE_URL: DEV_URL });
      expect.unreachable('deveria ter lançado');
    } catch (error) {
      expect((error as Error).message).not.toContain('senha');
      expect((error as Error).message).toContain(':***@');
    }
  });

  it('aceita e devolve a URL quando aponta de verdade para o banco E2E', () => {
    expect(
      assertE2eDatabaseUrl({
        DATABASE_URL: E2E_URL,
        DATABASE_URL_TEST: TEST_URL,
        DATABASE_URL_DEV: DEV_URL,
        DATABASE_URL_E2E: E2E_URL,
      }),
    ).toBe(E2E_URL);
  });

  it('aceita o banco E2E mesmo sem DATABASE_URL_TEST definida no ambiente', () => {
    expect(assertE2eDatabaseUrl({ DATABASE_URL: E2E_URL })).toBe(E2E_URL);
  });

  it('execução direta do script recusa bancos não autorizados com exit code 1 antes de conectar', () => {
    const backendDir = resolve(__dirname, '..');
    const tsxCli = resolve(backendDir, 'node_modules', 'tsx', 'dist', 'cli.mjs');
    const scriptPath = resolve(__dirname, 'e2e-reset-db.ts');

    // Porta inválida (1) de propósito: se o script tentasse abrir conexão TCP
    // antes de validar, o erro seria de conexão (ECONNREFUSED), não a recusa
    // imediata de assertE2eDatabaseUrl.
    const resultadoDev = spawnSync(process.execPath, [tsxCli, scriptPath], {
      cwd: backendDir,
      env: {
        ...process.env,
        DATABASE_URL: 'postgresql://stockflow:segredo_nao_vazar@127.0.0.1:1/stockflow',
      },
      encoding: 'utf-8',
    });

    expect(resultadoDev.status).toBe(1);
    expect(resultadoDev.stderr).toMatch(/deve apontar para um banco com "e2e" no nome/);
    expect(resultadoDev.stderr).not.toContain('segredo_nao_vazar');
  });
});
