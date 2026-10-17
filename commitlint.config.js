/**
 * Conventional Commits.
 *
 * Os escopos são fechados de propósito: escopo livre vira sinônimo com o tempo
 * ("api", "back", "backend" para a mesma coisa) e o histórico deixa de ser filtrável.
 */
export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'scope-enum': [
      2,
      'always',
      [
        'backend',
        'frontend',
        'db',
        'auth',
        'users',
        'categories',
        'suppliers',
        'products',
        'stock',
        'inventories',
        'reports',
        'audit',
        'dashboard',
        'ci',
        'docker',
        'docs',
        'deps',
      ],
    ],
    'subject-case': [2, 'always', 'lower-case'],
    'header-max-length': [2, 'always', 72],
    'body-max-line-length': [2, 'always', 100],
  },
};
