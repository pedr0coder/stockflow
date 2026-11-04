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
