import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

/**
 * Testes de integração: app NestJS real, PostgreSQL real, requisições por HTTP.
 *
 * Banco mockado não provaria nada do que importa neste projeto: as invariantes
 * de concorrência vivem no banco (docs/07-testes.md §7.2). Um mock provaria
 * apenas que o mock foi configurado conforme a expectativa.
 */
export default defineConfig({
  plugins: [
    swc.vite({
      jsc: {
        parser: { syntax: 'typescript', decorators: true },
        transform: { legacyDecorator: true, decoratorMetadata: true },
      },
      module: { type: 'es6' },
    }),
  ],
  test: {
    globals: true,
    environment: 'node',
    include: ['test/**/*.int-spec.ts'],
    // globalSetup roda uma vez, antes de tudo: aplica as migrations.
    // setupFiles roda por processo de teste: aponta o ambiente para o banco
    // de teste. São etapas diferentes e não dá para juntar.
    globalSetup: ['./test/global-setup.ts'],
    setupFiles: ['./test/setup-int.ts'],

    /**
     * Um processo só, um arquivo por vez.
     *
     * Os testes truncam tabelas entre casos. Em paralelo, o truncate de um
     * arquivo apagaria os dados que outro acabou de inserir, e a suíte falharia
     * de forma intermitente — o pior tipo de teste, porque ensina a equipe a
     * ignorar vermelho.
     *
     * O teste de concorrência da Fase 5 continua paralelo DENTRO do caso
     * (Promise.all de requisições), que é onde o paralelismo é o objeto do teste.
     */
    pool: 'forks',
    // Vitest 5 trouxe as opções de pool para o nível superior; `poolOptions`
    // foi removido.
    maxWorkers: 1,
    minWorkers: 1,
    fileParallelism: false,

    // Subir a app Nest e aplicar migration é mais lento que um teste unitário.
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
