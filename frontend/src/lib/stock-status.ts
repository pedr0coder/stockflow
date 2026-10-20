/**
 * Classificação da situação de estoque de um produto.
 *
 * Mora em `lib` e não junto do badge por dois motivos: é regra pura, testável
 * sem renderizar nada, e será usada também por filtro e relatório, que não têm
 * badge envolvido.
 *
 * As três faixas seguem a tabela de semântica do design system
 * (docs/06-mvp-e-telas.md §6.4):
 *
 *   sem estoque    currentStock == 0
 *   estoque baixo  0 < currentStock <= minStock
 *   normal         currentStock > minStock
 */
import { compareDecimal } from './decimal';

export type StockStatus = 'out' | 'low' | 'ok';

/**
 * Classifica a situação a partir dos saldos.
 *
 * Recebe string porque é como quantidade chega da API, e compara com
 * `compareDecimal`, que é exato e **não passa por `number`**
 * (docs/10-riscos.md R8). Ver `lib/decimal.ts` para o porquê de a comparação
 * precisar de implementação própria.
 */
export function classifyStock(currentStock: string, minStock: string): StockStatus {
  if (compareDecimal(currentStock, '0') <= 0) {
    return 'out';
  }

  return compareDecimal(currentStock, minStock) <= 0 ? 'low' : 'ok';
}
