import { describe, expect, it } from 'vitest';
import {
  formatCount,
  formatCurrency,
  formatDate,
  formatDateTime,
  formatQuantity,
  formatUnitCost,
} from './format';

describe('formatQuantity', () => {
  it('formata com três casas e separador brasileiro', () => {
    expect(formatQuantity('1234.5')).toBe('1.234,500');
  });

  it('preserva as três casas de um valor inteiro', () => {
    expect(formatQuantity('42')).toBe('42,000');
  });

  it('não perde precisão em valor que o float arredondaria', () => {
    // 0.1 + 0.2 em IEEE-754 dá 0.30000000000000004. Formatando a partir da
    // string, o valor chega intacto. Este caso falha se alguém trocar o
    // tratamento por `number`.
    expect(formatQuantity('0.3')).toBe('0,300');
    expect(formatQuantity('7.250')).toBe('7,250');
  });

  it('mantém a precisão de um decimal longo, que o float truncaria', () => {
    // 9007199254740993 é o primeiro inteiro ímpar que `number` não representa.
    expect(formatQuantity('9007199254740993', 0)).toBe('9.007.199.254.740.993');
  });

  it('aceita valor negativo', () => {
    expect(formatQuantity('-5.5')).toBe('-5,500');
  });

  it('devolve a string como veio quando ela não tem forma de número', () => {
    // Exibir "0,000" aqui esconderia um defeito de contrato atrás de um valor
    // plausível.
    expect(formatQuantity('indisponível')).toBe('indisponível');
    expect(formatQuantity('')).toBe('');
  });

  it('ignora espaço em volta', () => {
    expect(formatQuantity('  12.5  ')).toBe('12,500');
  });
});

describe('formatCurrency', () => {
  it('formata em reais com duas casas', () => {
    expect(formatCurrency('1234.5')).toMatch(/1\.234,50/);
    expect(formatCurrency('1234.5')).toMatch(/R\$/);
  });

  it('formata custo unitário com quatro casas', () => {
    expect(formatUnitCost('0.31')).toMatch(/0,3100/);
  });

  it('devolve a string como veio quando ela não é numérica', () => {
    expect(formatCurrency('sem valor')).toBe('sem valor');
  });
});

describe('formatCount', () => {
  it('usa separador de milhar brasileiro', () => {
    expect(formatCount(1248)).toBe('1.248');
  });

  it('formata zero', () => {
    expect(formatCount(0)).toBe('0');
  });
});

describe('formatDateTime', () => {
  it('produz data e hora no formato brasileiro', () => {
    // A hora resultante depende do fuso de quem executa, então a assertiva é
    // sobre o formato, não sobre o valor.
    expect(formatDateTime('2026-10-17T13:45:02.118Z')).toMatch(
      /^\d{2}\/\d{2}\/\d{4},? \d{2}:\d{2}$/,
    );
  });

  it('devolve a entrada quando a data é inválida', () => {
    expect(formatDateTime('não é data')).toBe('não é data');
  });
});

describe('formatDate', () => {
  it('produz apenas a data', () => {
    expect(formatDate('2026-10-17T13:45:02.118Z')).toMatch(/^\d{2}\/\d{2}\/\d{4}$/);
  });

  it('devolve a entrada quando a data é inválida', () => {
    expect(formatDate('')).toBe('');
  });
});
