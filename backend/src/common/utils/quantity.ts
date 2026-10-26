/**
 * Validação de quantidade decimal (docs/17-plano-fase-5.md §17.5.6).
 *
 * `Decimal(14,3)`: até 11 dígitos inteiros e 3 casas decimais. O teto de
 * dígitos inteiros existe para que uma entrada ridiculamente grande seja
 * recusada pelo DTO (400) em vez de estourar o `numeric` no banco e virar um
 * 500 — como a soma é feita no servidor, uma entrada isolada dentro do teto
 * ainda pode, em tese, levar o SALDO a estourar; esse caso é raro e tratado
 * separadamente pelo código `22003` do Postgres (ver `pg-error.ts`).
 *
 * Mais de 3 casas é RECUSADO, nunca arredondado: arredondar em silêncio
 * alteraria a quantidade que o operador digitou.
 */
const MAX_INTEGER_DIGITS = 11;
const MAX_SCALE = 3;

/** `/^\d{1,11}(\.\d{1,3})?$/`, construído a partir das constantes acima. */
export const QUANTITY_PATTERN = new RegExp(
  `^\\d{1,${MAX_INTEGER_DIGITS}}(\\.\\d{1,${MAX_SCALE}})?$`,
);

/**
 * `true` quando a string decimal representa exatamente zero.
 *
 * Comparação **textual**, não aritmética: nenhum `Number()` nem `parseFloat`
 * toca a quantidade em lugar nenhum do projeto (docs/17 §17.5.9). Uma
 * quantidade válida (pelo `QUANTITY_PATTERN`) é zero se, e só se, todo dígito
 * nela for `0`.
 */
function isZero(value: string): boolean {
  return !/[1-9]/.test(value);
}

/**
 * Quantidade de movimento (entrada/saída): string decimal, **maior que
 * zero**, até 3 casas. `0` não é quantidade de movimento — é a ausência de
 * um.
 */
export function isPositiveQuantity(value: string): boolean {
  return QUANTITY_PATTERN.test(value) && !isZero(value);
}

/** Quantidade final do ajuste: string decimal, **zero ou mais**, até 3 casas. */
export function isValidFinalQuantity(value: string): boolean {
  return QUANTITY_PATTERN.test(value);
}
