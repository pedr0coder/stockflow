import { describe, expect, it } from 'vitest';
import { classifyStock } from './stock-status';

/**
 * As três faixas da §6.4, com atenção especial às bordas, que é onde este tipo
 * de classificação costuma errar.
 */
describe('classifyStock', () => {
  it('classifica saldo zero como sem estoque', () => {
    expect(classifyStock('0.000', '10.000')).toBe('out');
  });

  it('classifica saldo igual ao mínimo como estoque baixo', () => {
    // A borda importa: a regra é `currentStock <= minStock`, então igual ao
    // mínimo já conta como baixo.
    expect(classifyStock('10.000', '10.000')).toBe('low');
  });

  it('classifica saldo abaixo do mínimo como estoque baixo', () => {
    expect(classifyStock('3.000', '10.000')).toBe('low');
  });

  it('classifica saldo acima do mínimo como normal', () => {
    expect(classifyStock('10.001', '10.000')).toBe('ok');
  });

  it('trata mínimo zero: qualquer saldo positivo é normal', () => {
    expect(classifyStock('1.000', '0.000')).toBe('ok');
    expect(classifyStock('0.000', '0.000')).toBe('out');
  });

  it('compara como número, e não como texto', () => {
    // Em comparação de string pura, "9" > "10". Se isso acontecesse, um
    // produto com saldo 9 e mínimo 10 apareceria como normal.
    expect(classifyStock('9.000', '10.000')).toBe('low');
    expect(classifyStock('100.000', '20.000')).toBe('ok');
  });

  it('respeita a casa decimal na comparação', () => {
    expect(classifyStock('10.001', '10.000')).toBe('ok');
    expect(classifyStock('9.999', '10.000')).toBe('low');
  });

  it('ignora espaço em volta', () => {
    expect(classifyStock(' 5.000 ', ' 10.000 ')).toBe('low');
  });
});
