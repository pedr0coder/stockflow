import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

/**
 * Desmonta a árvore React depois de cada teste.
 *
 * Sem isto, componentes de um teste permanecem no DOM e o `getByText` do teste
 * seguinte encontra dois elementos, falhando por "found multiple" em um teste
 * que estaria correto.
 */
afterEach(() => {
  cleanup();
});
