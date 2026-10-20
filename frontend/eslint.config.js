import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

/**
 * ESLint 10, flat config. Mesma régua do backend, com o que é específico de
 * React somado.
 */
export default tseslint.config(
  { ignores: ['dist/**', 'coverage/**', 'node_modules/**', 'src/components/ui/**'] },

  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,

  {
    languageOptions: {
      globals: { ...globals.browser },
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,

      /**
       * Garante que todo módulo com componente exporte apenas componentes, para
       * que o Fast Refresh do Vite consiga trocar o componente sem recarregar a
       * página inteira e perder o estado.
       */
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],

      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'all' },
      ],
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],

      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'no-console': 'error',
      'prefer-const': 'error',
    },
  },

  {
    // Em teste, montar duplo com a forma exata que o componente consome é mais
    // claro que satisfazer a interface completa de `fetch`.
    files: ['**/*.test.{ts,tsx}', 'src/test/**/*.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-empty-function': 'off',
    },
  },

  {
    // Arquivo de configuração: ESM, fora do tsconfig, sem regra type-aware.
    files: ['eslint.config.js'],
    extends: [tseslint.configs.disableTypeChecked],
  },

  prettier,
);
