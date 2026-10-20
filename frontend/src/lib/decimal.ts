/**
 * Comparação de decimais representados como string.
 *
 * Por que isto existe, e por que não é uma linha:
 *
 * A quantidade chega da API como string justamente para não passar por
 * `number`, que é IEEE-754 e perde precisão (docs/05-api.md §5.7,
 * docs/10-riscos.md R8). Então comparar dois saldos não pode começar com
 * `Number(a) - Number(b)`, que desfaria a garantia inteira.
 *
 * A tentativa óbvia de atalho, `a.localeCompare(b, 'en', { numeric: true })`,
 * **está errada** para decimal e foi pega por teste: a colação numérica do
 * ECMA-402 compara sequências de dígitos, não números fracionários. Ela
 * considera `'0.000'` maior que `'0'`, porque vê "0" igual a "0" e depois
 * encontra ".000" sobrando.
 *
 * A comparação abaixo é exata: separa sinal, parte inteira e parte
 * fracionária, normaliza zeros e compara dígito a dígito. Nada vira `number`
 * em momento nenhum.
 */

/** Forma aceita: sinal opcional, dígitos, parte fracionária opcional. */
const DECIMAL_PATTERN = /^[+-]?\d+(?:\.\d+)?$/;

export function isDecimalString(value: string): boolean {
  return DECIMAL_PATTERN.test(value.trim());
}

/**
 * Compara dois decimais em string.
 *
 * Devolve número negativo se `a < b`, zero se forem iguais em valor, e
 * positivo se `a > b`. Note que `'1.0'` e `'1'` são **iguais em valor**, o que
 * a comparação de string pura não daria.
 *
 * Entrada fora da forma decimal é tratada como zero, porque quem chama já
 * trabalha com dados de uma API que garante o formato, e lançar aqui
 * derrubaria a renderização de uma listagem inteira por causa de uma linha.
 */
export function compareDecimal(a: string, b: string): number {
  const left = parse(a);
  const right = parse(b);

  if (left.negative !== right.negative) {
    return left.negative ? -1 : 1;
  }

  const magnitude = compareMagnitude(left, right);

  // Com ambos negativos, a ordem se inverte: -5 é menor que -2.
  return left.negative ? -magnitude : magnitude;
}

interface ParsedDecimal {
  negative: boolean;
  integer: string;
  fraction: string;
}

function parse(value: string): ParsedDecimal {
  const trimmed = value.trim();

  if (!DECIMAL_PATTERN.test(trimmed)) {
    return { negative: false, integer: '0', fraction: '' };
  }

  const negative = trimmed.startsWith('-');
  const unsigned = trimmed.replace(/^[+-]/, '');
  const [integerPart = '0', fractionPart = ''] = unsigned.split('.');

  // Zeros à esquerda não mudam o valor e atrapalhariam a comparação por
  // comprimento logo abaixo.
  const integer = integerPart.replace(/^0+(?=\d)/, '');

  // Zeros à direita na fração também não mudam o valor: '1.50' é '1.5'.
  const fraction = fractionPart.replace(/0+$/, '');

  // '-0' e '0' são o mesmo valor, então o sinal é descartado nesse caso.
  const isZero = integer === '0' && fraction === '';

  return { negative: negative && !isZero, integer, fraction };
}

function compareMagnitude(a: ParsedDecimal, b: ParsedDecimal): number {
  // Mais dígitos na parte inteira significa número maior, já sem zeros à
  // esquerda. Compara em O(1) sem percorrer os dígitos.
  if (a.integer.length !== b.integer.length) {
    return a.integer.length < b.integer.length ? -1 : 1;
  }

  if (a.integer !== b.integer) {
    return a.integer < b.integer ? -1 : 1;
  }

  // Mesma parte inteira: compara a fração alinhada à direita com zeros, para
  // que '.5' e '.45' sejam comparados como '.50' e '.45'.
  const width = Math.max(a.fraction.length, b.fraction.length);
  const left = a.fraction.padEnd(width, '0');
  const right = b.fraction.padEnd(width, '0');

  if (left === right) {
    return 0;
  }

  return left < right ? -1 : 1;
}
