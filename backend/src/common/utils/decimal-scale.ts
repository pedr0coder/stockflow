import { Prisma } from '../../generated/prisma/client';

/**
 * Escala decimal de cada campo da API, por nome de campo.
 *
 * ┌────────────────────────────────────────────────────────────────────────┐
 * │ Por que um mapa por NOME, e não a escala do próprio valor.             │
 * │                                                                        │
 * │ `Decimal.toString()` devolve o valor sem casas supérfluas: um saldo    │
 * │ zero sai `"0"` e doze e meio sai `"12.5"`. O valor está exato, mas o   │
 * │ contrato (docs/05-api.md §5.7) promete `"0.000"` e `"12.500"`, e um    │
 * │ cliente que compare strings ou corte a casa decimal por posição lê     │
 * │ errado.                                                                │
 * │                                                                        │
 * │ A escala correta é a da COLUNA que gerou o valor, e o valor em si não  │
 * │ a carrega: `Decimal(14,3)` e `Decimal(14,4)` produzem o mesmo objeto   │
 * │ para o número 10. O serializador só tem o nome do campo em mãos, então │
 * │ é por ele que a escala é decidida.                                     │
 * │                                                                        │
 * │ O risco é óbvio: uma coluna decimal nova entra no schema, ninguém a    │
 * │ registra aqui, e ela sai com a escala errada em silêncio. É por isso   │
 * │ que `decimal-scale.spec.ts` lê `schema.prisma` e falha se o mapa e o   │
 * │ banco divergirem. O mapa não se mantém sozinho; o teste o obriga.      │
 * └────────────────────────────────────────────────────────────────────────┘
 */
export const DECIMAL_FIELD_SCALES: Readonly<Record<string, number>> = {
  // Quantidades: Decimal(14,3).
  currentStock: 3,
  minStock: 3,
  quantity: 3,
  stockBefore: 3,
  stockAfter: 3,
  expectedQty: 3,
  countedQty: 3,

  // Dinheiro: Decimal(14,4).
  unitCost: 4,
};

/**
 * Escala de um campo, ou `undefined` quando o campo não é decimal conhecido.
 *
 * Devolver `undefined` em vez de um padrão é deliberado: um padrão silencioso
 * faria um campo esquecido parecer correto. Quem chama decide o que fazer, e
 * hoje a decisão é cair em `toString()`, que preserva o valor.
 */
export function decimalScaleOf(field: string): number | undefined {
  return DECIMAL_FIELD_SCALES[field];
}

/**
 * Representação textual de um decimal, na escala do campo.
 *
 * Único lugar onde um `Decimal` vira texto no projeto. É usado tanto pela
 * resposta HTTP quanto pelo snapshot do log de auditoria, e isso é
 * deliberado: um log que mostrasse `19.5` para um saldo que a API devolveu
 * como `"19.500"` obrigaria quem investiga um incidente a decidir qual dos
 * dois é o valor real.
 *
 * `toFixed` do `Decimal` é aritmética decimal, não IEEE-754: para um valor que
 * já veio do banco com a escala da coluna, a operação é só completar os zeros
 * à direita.
 *
 * Campo sem escala registrada cai em `toString()`, que preserva o valor. É o
 * caminho conservador: casa decimal encolhida, nunca valor errado — e o teste
 * de contrato contra o `schema.prisma` falha antes de isso chegar a um cliente.
 */
export function formatDecimalField(value: Prisma.Decimal, field: string | undefined): string {
  const scale = field === undefined ? undefined : decimalScaleOf(field);

  return scale === undefined ? value.toString() : value.toFixed(scale);
}
