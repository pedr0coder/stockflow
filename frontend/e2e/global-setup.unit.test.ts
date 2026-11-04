import { describe, expect, it, vi } from 'vitest';
import { extractDatabaseName, runGlobalSetup, selectE2eDatabaseUrl } from './global-setup';

/**
 * Prova a recusa do mecanismo de isolamento do banco E2E com strings
 * sintéticas — nenhum arquivo `.env` é lido, nenhuma conexão real é aberta
 * (Marco 7A, validação de isolamento pedida na revisão).
 *
 * `selectE2eDatabaseUrl` é a MESMA função que `resolveE2eDatabaseUrl()` chama
 * — e que `globalSetup()` executa como primeira linha, antes de montar o
 * `env` dos processos filhos e antes de qualquer `migrate deploy`/truncate/
 * `db seed` rodar. Testar esta função e `runGlobalSetup` prova que a checagem
 * acontece antes de qualquer operação destrutiva poder começar.
 *
 * Extensão `.unit.test.ts`, e não `.spec.ts`: o Playwright já reserva
 * arquivos terminados em "spec.ts" para os specs de navegador
 * (`testMatch` em `playwright.config.ts`); esta extensão roda pelo Vitest
 * (ver `include` em `vite.config.ts`), não abre browser nenhum e termina em
 * milissegundos.
 */

const DEV_URL = 'postgresql://stockflow:senha@localhost:5432/stockflow?schema=public';
const TEST_URL = 'postgresql://stockflow:senha@localhost:5432/stockflow_test?schema=public';
const E2E_URL = 'postgresql://stockflow:senha@localhost:5432/stockflow_e2e?schema=public';
const OUTRO_BANCO_URL = 'postgresql://stockflow:senha@localhost:5432/qualquer_outro?schema=public';

describe('selectE2eDatabaseUrl', () => {
  it('recusa quando DATABASE_URL_E2E não está definida', () => {
    expect(() => selectE2eDatabaseUrl({})).toThrow('DATABASE_URL_E2E não definida');
  });

  it('recusa se DATABASE_URL_E2E apontar para o banco de desenvolvimento', () => {
    expect(() => selectE2eDatabaseUrl({ DATABASE_URL_E2E: DEV_URL })).toThrow(
      /deve apontar para um banco com "e2e" no nome/,
    );
  });

  it('recusa se DATABASE_URL_E2E apontar para o banco de integração', () => {
    expect(() => selectE2eDatabaseUrl({ DATABASE_URL_E2E: TEST_URL })).toThrow(
      /deve apontar para um banco com "e2e" no nome/,
    );
  });

  it('recusa qualquer banco fora do padrão esperado, mesmo sem ser dev nem integração', () => {
    expect(() => selectE2eDatabaseUrl({ DATABASE_URL_E2E: OUTRO_BANCO_URL })).toThrow(
      /deve apontar para um banco com "e2e" no nome/,
    );
  });

  it('recusa se "e2e" aparecer apenas na senha, usuário, host ou query mas o banco for dev ou test', () => {
    const devComSenhaE2e =
      'postgresql://stockflow:senha_e2e_123@localhost:5432/stockflow?schema=public';
    const testComUserE2e =
      'postgresql://user_e2e:senha@localhost:5432/stockflow_test?schema=public';
    const devComQueryE2e =
      'postgresql://stockflow:senha@localhost:5432/stockflow?application_name=e2e';

    expect(() => selectE2eDatabaseUrl({ DATABASE_URL_E2E: devComSenhaE2e })).toThrow(
      /deve apontar para um banco com "e2e" no nome/,
    );
    expect(() => selectE2eDatabaseUrl({ DATABASE_URL_E2E: testComUserE2e })).toThrow(
      /deve apontar para um banco com "e2e" no nome/,
    );
    expect(() => selectE2eDatabaseUrl({ DATABASE_URL_E2E: devComQueryE2e })).toThrow(
      /deve apontar para um banco com "e2e" no nome/,
    );
  });

  it('recusa quando DATABASE_URL_E2E é igual a DATABASE_URL (mesmo contendo "e2e")', () => {
    const coincidencia = 'postgresql://stockflow:senha@localhost:5432/dev_e2e_mix?schema=public';

    expect(() =>
      selectE2eDatabaseUrl({ DATABASE_URL_E2E: coincidencia, DATABASE_URL: coincidencia }),
    ).toThrow(/mesmo banco que DATABASE_URL/);
  });

  it('recusa quando DATABASE_URL_E2E é igual a DATABASE_URL_TEST (mesmo contendo "e2e")', () => {
    const coincidencia = 'postgresql://stockflow:senha@localhost:5432/test_e2e_mix?schema=public';

    expect(() =>
      selectE2eDatabaseUrl({ DATABASE_URL_E2E: coincidencia, DATABASE_URL_TEST: coincidencia }),
    ).toThrow(/mesmo banco que DATABASE_URL/);
  });

  it('recusa quando o nome do banco coincide com DATABASE_URL ou DATABASE_URL_TEST mesmo com host, porta ou query string diferentes', () => {
    const baseE2e = 'postgresql://stockflow:senha@localhost:5432/stockflow_e2e?schema=public';
    const outroHostSemQuery = 'postgresql://stockflow:senha@127.0.0.1:5432/stockflow_e2e';
    const outraPorta =
      'postgresql://stockflow:senha@localhost:15432/stockflow_e2e?connect_timeout=5';

    expect(() =>
      selectE2eDatabaseUrl({ DATABASE_URL_E2E: baseE2e, DATABASE_URL: outroHostSemQuery }),
    ).toThrow(/mesmo banco que DATABASE_URL/);
    expect(() =>
      selectE2eDatabaseUrl({ DATABASE_URL_E2E: baseE2e, DATABASE_URL_TEST: outraPorta }),
    ).toThrow(/mesmo banco que DATABASE_URL/);
  });

  it('recusa URL malformada ou sem nome de banco', () => {
    expect(() => selectE2eDatabaseUrl({ DATABASE_URL_E2E: 'nao-eh-url-e2e' })).toThrow(
      /URL de banco inválida/,
    );
    expect(() =>
      selectE2eDatabaseUrl({ DATABASE_URL_E2E: 'postgresql://stockflow:senha@localhost:5432/' }),
    ).toThrow(/Nome do banco ausente/);
    expect(() => extractDatabaseName('http://localhost:5432/stockflow_e2e')).toThrow(
      /Protocolo de banco inválido/,
    );
  });

  it('a mensagem de erro nunca expõe a senha da URL rejeitada', () => {
    try {
      selectE2eDatabaseUrl({ DATABASE_URL_E2E: DEV_URL });
      expect.unreachable('deveria ter lançado');
    } catch (error) {
      expect((error as Error).message).not.toContain('senha');
      expect((error as Error).message).toContain(':***@');
    }
  });

  it('aceita e devolve a URL quando ela aponta de verdade para o banco E2E, distinto dos outros dois', () => {
    expect(
      selectE2eDatabaseUrl({
        DATABASE_URL_E2E: E2E_URL,
        DATABASE_URL: DEV_URL,
        DATABASE_URL_TEST: TEST_URL,
      }),
    ).toBe(E2E_URL);
  });

  it('aceita o banco E2E mesmo sem DATABASE_URL/DATABASE_URL_TEST definidas no ambiente', () => {
    expect(selectE2eDatabaseUrl({ DATABASE_URL_E2E: E2E_URL })).toBe(E2E_URL);
  });
});

describe('runGlobalSetup — recusa antes de migrar, truncar ou semear', () => {
  it('não executa nenhum subprocesso (migrate, reset, seed) quando a URL é de desenvolvimento ou integração', () => {
    const runner = vi.fn();

    expect(() =>
      runGlobalSetup(
        {
          DATABASE_URL_E2E: DEV_URL,
          DATABASE_URL: DEV_URL,
          DATABASE_URL_TEST: TEST_URL,
        },
        runner,
      ),
    ).toThrow(/deve apontar para um banco com "e2e" no nome/);
    expect(runner).not.toHaveBeenCalled();

    expect(() =>
      runGlobalSetup(
        {
          DATABASE_URL_E2E: TEST_URL,
          DATABASE_URL: DEV_URL,
          DATABASE_URL_TEST: TEST_URL,
        },
        runner,
      ),
    ).toThrow(/deve apontar para um banco com "e2e" no nome/);
    expect(runner).not.toHaveBeenCalled();

    expect(() =>
      runGlobalSetup(
        {
          DATABASE_URL_E2E: E2E_URL,
          DATABASE_URL: E2E_URL,
          DATABASE_URL_TEST: TEST_URL,
        },
        runner,
      ),
    ).toThrow(/mesmo banco que DATABASE_URL/);
    expect(runner).not.toHaveBeenCalled();
  });
});
