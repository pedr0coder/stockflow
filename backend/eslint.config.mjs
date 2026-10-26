import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

/**
 * ESLint 10, flat config.
 *
 * Usa as regras *type-aware* do typescript-eslint (`recommendedTypeChecked`),
 * que precisam do type checker e por isso custam mais tempo. A troca vale neste
 * backend: é esse conjunto que pega `await` esquecido em Promise, comparação
 * entre tipos que nunca são iguais e uso de `any` vindo de biblioteca sem tipo.
 * As regras puramente sintáticas pegariam nada disso.
 *
 * Formatação não é assunto do ESLint aqui: `eslint-config-prettier` desliga as
 * regras de estilo, e o Prettier da raiz formata. Duas ferramentas discutindo
 * vírgula é atrito sem ganho.
 */
export default tseslint.config(
  {
    // Código gerado e artefato de build não são revisáveis.
    ignores: ['dist/**', 'coverage/**', 'src/generated/**', 'node_modules/**'],
  },

  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,

  {
    languageOptions: {
      globals: { ...globals.node },
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      /**
       * `any` explícito é erro, não aviso. Um aviso em `any` é um aviso que
       * entra no código e fica (requisito 16 do projeto).
       */
      '@typescript-eslint/no-explicit-any': 'error',

      // Variável não usada é erro, exceto argumento prefixado com _, que é a
      // forma convencional de dizer "sei que existe e não vou usar".
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'all' },
      ],

      /**
       * Promise sem `await` nem tratamento é a origem de erro silencioso em
       * código com banco: a transação falha, ninguém vê, a requisição responde
       * 200. Erro, não aviso.
       */
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/await-thenable': 'error',
      '@typescript-eslint/no-misused-promises': 'error',

      // Toda função exportada declara o retorno: o tipo passa a ser contrato,
      // não consequência da implementação.
      '@typescript-eslint/explicit-module-boundary-types': 'error',

      // Em template string, só o que já é string. Evita "[object Object]"
      // aparecendo em mensagem de erro e em log.
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],

      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'no-console': 'error',
      'prefer-const': 'error',
      'no-param-reassign': 'error',
    },
  },

  {
    /**
     * Nos testes, `any` e asserção de tipo são ferramenta legítima: montar um
     * duplo de `ArgumentsHost` com a forma exata que o SUT consome é mais claro
     * que satisfazer a interface inteira do Nest.
     */
    files: ['**/*.spec.ts', '**/*.int-spec.ts', 'test/**/*.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/explicit-module-boundary-types': 'off',
    },
  },

  {
    // O seed informa o progresso no terminal: é a saída dele, não log perdido.
    files: ['prisma/seed.ts'],
    rules: { 'no-console': 'off' },
  },

  {
    /**
     * Arquivos de configuração: sem regras type-aware.
     *
     * Eles ficam fora do `tsconfig.json` de propósito, porque são ESM
     * (`import.meta`) enquanto o backend compila para CommonJS. Sem projeto
     * TypeScript, o type checker não tem tipo para nada ali, e as regras
     * type-aware passariam a acusar `import.meta.dirname` como valor de tipo
     * `error` — ou seja, ruído, não defeito.
     */
    files: ['*.mjs', '*.mts', 'prisma7.config.ts'],
    extends: [tseslint.configs.disableTypeChecked],
  },

  {
    /**
     * Nenhum valor de estoque passa por ponto flutuante (docs/17-plano-fase-5.md
     * §17.5.9). `number` em JavaScript é IEEE-754 e perde precisão em
     * quantidade — o mesmo motivo de o banco usar `Decimal`. A regra cobre o
     * caminho de quantidade e o SQL cru da movimentação: `Number()`,
     * `parseFloat`, `Math.*` e `.toNumber()` em qualquer um desses arquivos é
     * erro de lint, não de revisão humana. Onde uma comparação sem aritmética é
     * de fato necessária (ex.: achar o dígito não-zero de uma string), o código
     * usa regex, não conversão numérica.
     */
    files: ['src/stock-movements/**/*.ts', 'src/common/utils/quantity.ts'],
    ignores: ['**/*.spec.ts', '**/*.int-spec.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: "CallExpression[callee.name='Number']",
          message: 'Quantidade de estoque não passa por Number(). Use Prisma.Decimal ou string.',
        },
        {
          selector: "CallExpression[callee.name='parseFloat']",
          message:
            'Quantidade de estoque não passa por parseFloat(). Use Prisma.Decimal ou string.',
        },
        {
          selector: "CallExpression[callee.name='parseInt']",
          message: 'Quantidade de estoque não passa por parseInt(). Use Prisma.Decimal ou string.',
        },
        {
          selector: "CallExpression[callee.object.name='Math']",
          message: 'Quantidade de estoque não passa por Math.*. Use os métodos de Prisma.Decimal.',
        },
        {
          selector: "CallExpression[callee.property.name='toNumber']",
          message: '.toNumber() perde precisão. A quantidade sai como Decimal ou string.',
        },
      ],
    },
  },

  prettier,
);
