import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { config as loadEnv } from 'dotenv';

/**
 * Prepara o banco de teste antes de qualquer arquivo de teste rodar.
 *
 * Roda UMA vez por execução da suíte, em processo separado dos testes.
 *
 * Por que aqui e não em um passo manual do README: um teste de integração que
 * depende de alguém ter lembrado de rodar uma migration falha de forma
 * confusa. O erro aparece como "a tabela não existe" no meio de um caso que
 * testa outra coisa, e a pessoa vai procurar o defeito no lugar errado.
 * A suíte prepara o próprio ambiente (docs/07-testes.md §7.7).
 */
export default function setup(): void {
  loadEnv({ path: resolve(process.cwd(), '../.env'), override: false, quiet: true });

  const databaseUrl = process.env['DATABASE_URL_TEST'];

  if (!databaseUrl) {
    throw new Error('DATABASE_URL_TEST não definida. Veja .env.example.');
  }

  if (!/test/i.test(databaseUrl)) {
    throw new Error('DATABASE_URL_TEST precisa apontar para um banco com "test" no nome.');
  }

  /**
   * O CLI é invocado pelo caminho direto do arquivo, e não por `npx` com
   * `shell: true`.
   *
   * `shell: true` concatena os argumentos em vez de escapá-los (o Node avisa
   * disso com DEP0190), e seria preciso só para o `npx.cmd` do Windows.
   * Chamando o `index.js` do pacote com o próprio executável do Node, o
   * comando é idêntico nas três plataformas e não passa por shell nenhum.
   */
  const prismaCli = resolve(process.cwd(), 'node_modules', 'prisma', 'build', 'index.js');

  try {
    // `migrate deploy` apenas aplica o que já existe. `migrate dev` poderia
    // gerar migration nova e pedir confirmação interativa, o que travaria a
    // suíte esperando uma resposta que ninguém vai digitar.
    execFileSync(process.execPath, [prismaCli, 'migrate', 'deploy'], {
      env: { ...process.env, DATABASE_URL: databaseUrl },
      stdio: 'pipe',
    });
  } catch (error) {
    // `cause` preserva o erro original: a mensagem diz o que fazer, e a causa
    // mantém a saída real do Prisma para quem precisar depurar.
    throw new Error(
      'Não foi possível aplicar as migrations no banco de teste.\n' +
        'O PostgreSQL está de pé? Tente `docker compose up -d db`.',
      { cause: error },
    );
  }
}
