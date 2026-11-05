import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
// defineConfig do vitest/config e não do vite: é ele que tipa a chave `test`.
import { defineConfig } from 'vitest/config';

/**
 * Tailwind v4 entra como **plugin do Vite**, e não como plugin do PostCSS.
 *
 * É a mudança central da v4: não há `tailwind.config.js` nem `postcss.config.js`
 * neste projeto. A configuração de tema é CSS-first, via `@theme` em
 * src/index.css, que é a fonte única de verdade do design system
 * (docs/06-mvp-e-telas.md §6.4). Procurar um `tailwind.config.js` aqui e não
 * achar é esperado.
 */
export default defineConfig({
  plugins: [react(), tailwindcss()],

  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },

  /**
   * Chunks de vendor determinísticos (Marco 7C, M7C-1 / D7-7).
   *
   * O Vite 8 empacota com Rolldown, onde `manualChunks` está obsoleto; o
   * equivalente é `codeSplitting.groups`. Sem isto, o Rolldown ainda divide por
   * rota, mas dá nomes instáveis aos chunks compartilhados (`button-<hash>`,
   * `dist-<hash>`...) e mistura bibliotecas que mudam em ritmos diferentes.
   * Com grupos por biblioteca, o hash de `vendor-react` só muda quando o React
   * muda, e o cache HTTP de longo prazo sobrevive a um deploy de código da
   * aplicação.
   *
   * `vendor-charts` agrupa só o que o `recharts` traz. Nenhum módulo carregado
   * na entrada pode cair nesse grupo — senão o gráfico voltaria ao caminho
   * crítico. `@tanstack/react-table` também fica separado de `react-query`:
   * a tabela só é usada por páginas carregadas sob demanda, e juntá-las
   * custaria ~35 kB à carga inicial. Os primitivos de UI (radix) ficam sem
   * grupo de propósito: agrupá-los puxava para a entrada módulos usados só
   * por páginas lazy (medido: 579 kB iniciais contra 542 kB sem o grupo).
   *
   * Nada aqui usa `chunkSizeWarningLimit`: o aviso de 500 kB continua ligado
   * e o build deve passar sem ele.
   */
  build: {
    rolldownOptions: {
      output: {
        codeSplitting: {
          // Sem isto, o grupo de maior prioridade (`vendor-charts`) arrasta
          // para dentro de si as dependências dos seus módulos — inclusive o
          // React, que `react-redux` importa — e o chunk do gráfico passa a
          // fazer parte da carga inicial.
          includeDependenciesRecursively: false,
          groups: [
            {
              // `use-sync-external-store` é dependência do `recharts` (via
              // `react-redux`) E do `@tanstack/react-table` (via `react-store`).
              // Num grupo próprio, os dois apontam para ele e nenhum puxa o
              // chunk do gráfico — dentro de `vendor-charts`, as listagens
              // baixariam 365 kB de gráfico; fora de qualquer grupo, ele caía no
              // chunk de `MovementsChart` e criava um ciclo entre chunks
              // (`MovementsChart` ⇄ `vendor-charts`), detectado na auditoria.
              name: 'vendor-sync',
              test: /node_modules[\\/]use-sync-external-store[\\/]/,
              priority: 50,
            },
            {
              name: 'vendor-charts',
              test: /node_modules[\\/](recharts|d3-[^\\/]+|victory-vendor|internmap|@reduxjs|react-redux|redux|redux-thunk|immer|reselect|es-toolkit|decimal\.js-light|eventemitter3|tiny-invariant|react-is)[\\/]/,
              priority: 40,
            },
            {
              name: 'vendor-react',
              test: /node_modules[\\/](react|react-dom|scheduler|react-router)[\\/]/,
              priority: 30,
            },
            {
              name: 'vendor-forms',
              test: /node_modules[\\/](react-hook-form|@hookform|zod)[\\/]/,
              priority: 20,
            },
            {
              name: 'vendor-query',
              test: /node_modules[\\/]@tanstack[\\/](react-query|query-core)[\\/]/,
              priority: 20,
            },
            {
              name: 'vendor-table',
              test: /node_modules[\\/]@tanstack[\\/](react-table|table-core|react-store|store)[\\/]/,
              priority: 20,
            },
          ],
        },
      },
    },
  },

  server: {
    port: 5173,
    // '0.0.0.0' para que a porta seja alcançável de fora do container.
    host: true,
    /**
     * Proxy do dev server para a API.
     *
     * Com o proxy, o navegador fala só com a origem do Vite, então em
     * desenvolvimento não há requisição cross-origin e o cookie httpOnly do
     * refresh (ADR-0005) é tratado como same-site. Sem isto, seria preciso
     * relaxar SameSite em desenvolvimento e manter restrito em produção: duas
     * configurações diferentes, e a de desenvolvimento acabaria em produção.
     */
    proxy: {
      '/api': {
        /**
         * No modo híbrido (API no host) o alvo é localhost. No modo completo
         * (tudo em container) o compose define VITE_PROXY_TARGET como
         * http://backend:3000, porque dentro da rede do Docker "localhost" é o
         * próprio container do frontend, não a API.
         */
        target: process.env['VITE_PROXY_TARGET'] ?? 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },

  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}', 'e2e/**/*.unit.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.test.{ts,tsx}', 'src/test/**', 'src/main.tsx', 'src/vite-env.d.ts'],
    },
  },
});
