import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

/**
 * Testes unitários: sem banco, sem HTTP, sem rede.
 *
 * O plugin do SWC substitui o esbuild na transformação de TypeScript. Motivo:
 * o esbuild não implementa `emitDecoratorMetadata`, e a injeção de dependência
 * do NestJS depende desses metadados. Sem isto, qualquer teste que monte um
 * módulo do Nest falha com "Nest can't resolve dependencies", mesmo com o
 * módulo correto. Ver docs/03-stack.md §3.5.1.
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
    include: ['src/**/*.spec.ts', 'scripts/**/*.spec.ts', 'prisma/**/*.spec.ts'],
    env: {
      NODE_ENV: 'test',
      PORT: '3000',
      DATABASE_URL: 'postgresql://stockflow:test@localhost:5432/stockflow_test?schema=public',
      JWT_SECRET: 'local_test_jwt_secret_with_more_than_32_characters_000',
      JWT_REFRESH_SECRET: 'local_test_jwt_refresh_secret_with_more_than_32_chars_111',
      JWT_ACCESS_TTL: '15m',
      JWT_REFRESH_TTL: '7d',
      CORS_ORIGINS: 'http://localhost:5173',
      LOG_LEVEL: 'error',
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/**/*.ts'],
      exclude: [
        // Código gerado pelo Prisma: não é nosso e tem @ts-nocheck.
        'src/generated/**',
        'src/**/*.spec.ts',
        'src/**/dto/**',
        // Bootstrap é verificado pelos testes de integração, que sobem a app.
        'src/main.ts',
        'src/**/*.module.ts',
      ],
    },
  },
});
