/**
 * Formatação para apresentação, em pt-BR.
 *
 * Regra que vale para o arquivo inteiro: **quantidade e valor chegam da API
 * como string e são formatados sem passar por `number`.**
 *
 * O motivo é o mesmo que levou o banco a usar `Decimal` e a API a trafegar
 * string (docs/05-api.md §5.7 e docs/10-riscos.md R8): `number` em JavaScript é
 * IEEE-754, e `0.1 + 0.2 !== 0.3`. Em saldo de estoque e em custo, esse erro se
 * acumula. O `Intl.NumberFormat` aceita string numérica justamente para esse
 * caso, e a trata com precisão arbitrária.
 */

const LOCALE = 'pt-BR';

/**
 * Casas decimais de quantidade, espelhando `Decimal(14,3)` do banco.
 * A constante existe para que a escala apareça em um lugar só.
 */
export const QUANTITY_SCALE = 3;

/** Casas decimais de custo unitário, espelhando `Decimal(14,4)`. */
export const COST_SCALE = 4;

/** Forma de uma string decimal: sinal opcional, dígitos, parte fracionária opcional. */
const DECIMAL_PATTERN = /^-?\d+(?:\.\d+)?$/;

/**
 * Verifica que a string tem forma de número e estreita o tipo.
 *
 * `Intl.NumberFormat.format` é tipado para aceitar `` `${number}` ``, e não
 * `string` solta. A asserção depois do teste é estreita e justificada: o regex
 * acima prova exatamente a forma que o tipo descreve. A alternativa seria
 * converter para `number`, que é o que este arquivo inteiro existe para evitar.
 */
function isNumericString(value: string): value is `${number}` {
  return DECIMAL_PATTERN.test(value);
}

/**
 * Formata quantidade de estoque.
 *
 * Se a string não tiver forma de número, ela é devolvida **como veio**. Exibir
 * "0,000" nesse caso esconderia um defeito de contrato atrás de um valor
 * plausível, que é exatamente o tipo de coisa que este projeto não faz.
 */
export function formatQuantity(value: string, scale: number = QUANTITY_SCALE): string {
  const trimmed = value.trim();

  if (!isNumericString(trimmed)) {
    return trimmed;
  }

  return new Intl.NumberFormat(LOCALE, {
    minimumFractionDigits: scale,
    maximumFractionDigits: scale,
  }).format(trimmed);
}

/** Formata valor monetário em reais. Mesma regra de entrada inválida. */
export function formatCurrency(value: string, scale = 2): string {
  const trimmed = value.trim();

  if (!isNumericString(trimmed)) {
    return trimmed;
  }

  return new Intl.NumberFormat(LOCALE, {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: scale,
    maximumFractionDigits: scale,
  }).format(trimmed);
}

/** Formata custo unitário, que usa mais casas que um preço de venda. */
export function formatUnitCost(value: string): string {
  return formatCurrency(value, COST_SCALE);
}

/** Formata número inteiro de contagem, como "1.248". */
export function formatCount(value: number): string {
  return new Intl.NumberFormat(LOCALE).format(value);
}

/**
 * Formata data e hora no fuso local de quem está olhando.
 *
 * A API devolve `timestamptz` em UTC (docs/04-banco-de-dados.md §4.2). A
 * conversão para horário local acontece **só** na apresentação, que é aqui.
 */
export function formatDateTime(isoDate: string): string {
  const date = new Date(isoDate);

  if (Number.isNaN(date.getTime())) {
    return isoDate;
  }

  return new Intl.DateTimeFormat(LOCALE, { dateStyle: 'short', timeStyle: 'short' }).format(date);
}

/** Formata apenas a data, sem a hora. */
export function formatDate(isoDate: string): string {
  const date = new Date(isoDate);

  if (Number.isNaN(date.getTime())) {
    return isoDate;
  }

  return new Intl.DateTimeFormat(LOCALE, { dateStyle: 'short' }).format(date);
}
