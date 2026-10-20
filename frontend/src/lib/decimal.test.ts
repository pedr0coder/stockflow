import { describe, expect, it } from 'vitest';
import { compareDecimal, isDecimalString } from './decimal';

/** Normaliza o retorno para -1, 0 ou 1, que é o que importa no contrato. */
function sign(value: number): number {
  return Math.sign(value);
}

describe('compareDecimal', () => {
  it('reconhece valores iguais escritos de formas diferentes', () => {
    // É o caso que derrubou a primeira implementação, baseada em
    // `localeCompare` com ordenação numérica.
    expect(sign(compareDecimal('0.000', '0'))).toBe(0);
    expect(sign(compareDecimal('1.0', '1'))).toBe(0);
    expect(sign(compareDecimal('1.50', '1.5'))).toBe(0);
    expect(sign(compareDecimal('007', '7'))).toBe(0);
    expect(sign(compareDecimal('-0', '0'))).toBe(0);
  });

  it('compara pela grandeza, não pelo texto', () => {
    // Em comparação de string pura, '9' viria depois de '10'.
    expect(sign(compareDecimal('9', '10'))).toBe(-1);
    expect(sign(compareDecimal('100', '20'))).toBe(1);
  });

  it('compara a parte fracionária com alinhamento correto', () => {
    // '.5' é maior que '.45', apesar de '45' ser maior que '5' como texto.
    expect(sign(compareDecimal('1.5', '1.45'))).toBe(1);
    expect(sign(compareDecimal('1.05', '1.4'))).toBe(-1);
    expect(sign(compareDecimal('7.250', '7.500'))).toBe(-1);
  });

  it('ordena negativos de forma invertida', () => {
    expect(sign(compareDecimal('-5', '-2'))).toBe(-1);
    expect(sign(compareDecimal('-2', '-5'))).toBe(1);
    expect(sign(compareDecimal('-1', '1'))).toBe(-1);
    expect(sign(compareDecimal('0', '-1'))).toBe(1);
  });

  it('mantém precisão além do que o float representa', () => {
    // 9007199254740993 e 9007199254740992 colapsam no mesmo `number`.
    expect(sign(compareDecimal('9007199254740993', '9007199254740992'))).toBe(1);

    // 0.1 + 0.2 !== 0.3 em IEEE-754. Aqui a comparação é exata.
    expect(sign(compareDecimal('0.30000000000000004', '0.3'))).toBe(1);
  });

  it('ignora espaço em volta', () => {
    expect(sign(compareDecimal('  2.5 ', '2.5'))).toBe(0);
  });

  it('trata entrada inválida como zero, sem lançar', () => {
    // Uma linha com dado fora do contrato não pode derrubar a listagem toda.
    expect(sign(compareDecimal('abc', '0'))).toBe(0);
    expect(sign(compareDecimal('abc', '1'))).toBe(-1);
  });

  it('é consistente: se a < b então b > a', () => {
    const pares: readonly [string, string][] = [
      ['1', '2'],
      ['0.1', '0.2'],
      ['-3', '-1'],
      ['10.001', '10.000'],
    ];

    for (const [a, b] of pares) {
      expect(sign(compareDecimal(a, b))).toBe(-sign(compareDecimal(b, a)));
    }
  });
});

describe('isDecimalString', () => {
  it('aceita as formas que a API produz', () => {
    expect(isDecimalString('0')).toBe(true);
    expect(isDecimalString('12.500')).toBe(true);
    expect(isDecimalString('-3.25')).toBe(true);
    expect(isDecimalString(' 7 ')).toBe(true);
  });

  it('recusa o que não é decimal', () => {
    expect(isDecimalString('')).toBe(false);
    expect(isDecimalString('1,5')).toBe(false);
    expect(isDecimalString('1e3')).toBe(false);
    expect(isDecimalString('abc')).toBe(false);
    expect(isDecimalString('1.')).toBe(false);
  });
});
