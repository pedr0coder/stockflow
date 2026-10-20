import { render, type RenderResult } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router';

/**
 * Renderiza um componente dentro de um roteador em memória.
 *
 * Serve a componentes que usam `NavLink`, `Link` ou hooks de rota e que, fora
 * de um roteador, lançariam. O roteador é real, não um duplo: o que se quer
 * testar é o comportamento com a biblioteca que roda em produção.
 *
 * O arquivo guarda **apenas** o que algum teste usa. Auxiliar de teste sem uso
 * é código morto como qualquer outro, e envelhece pior, porque ninguém o
 * executa para perceber que quebrou.
 */
export function renderWithRouter(
  ui: ReactNode,
  { route = '/' }: { route?: string } = {},
): RenderResult {
  return render(<MemoryRouter initialEntries={[route]}>{ui}</MemoryRouter>);
}
