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

/**
 * jsdom não implementa `hasPointerCapture`/`scrollIntoView` — APIs reais de
 * navegador que o Radix UI (`Select`, `DropdownMenu`) chama ao abrir/navegar
 * um menu por ponteiro. Sem isto, qualquer teste que clica para abrir um
 * `Select` lança `TypeError` no meio do evento, não uma falha do componente
 * sendo testado.
 */
if (typeof Element !== 'undefined') {
  if (!Element.prototype.hasPointerCapture) {
    Element.prototype.hasPointerCapture = () => false;
  }

  if (!Element.prototype.releasePointerCapture) {
    Element.prototype.releasePointerCapture = () => undefined;
  }

  if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = () => undefined;
  }
}
