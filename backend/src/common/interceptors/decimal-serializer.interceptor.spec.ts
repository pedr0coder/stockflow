import { describe, expect, it } from 'vitest';
import { Prisma } from '../../generated/prisma/client';
import { serializeDecimals } from './decimal-serializer.interceptor';

/**
 * Sem esta conversão a API devolve a representação interna do objeto
 * `Decimal`, que é inutilizável pelo cliente. O defeito existiu de verdade
 * durante a construção: a resposta trazia `{"s":1,"e":1,"d":[10]}` no lugar de
 * `"10"`, e só apareceu ao olhar o JSON cru.
 */
describe('serializeDecimals', () => {
  it('converte Decimal em string', () => {
    expect(serializeDecimals(new Prisma.Decimal('12.5'))).toBe('12.5');
  });

  it('nunca produz number, que perderia precisão', () => {
    const resultado = serializeDecimals(new Prisma.Decimal('0.1'));

    // É o ponto do arquivo inteiro: string, não number (docs/05-api.md §5.7).
    expect(typeof resultado).toBe('string');
  });

  it('preserva valor que o float não representa', () => {
    const exato = '9007199254740993.25';

    expect(serializeDecimals(new Prisma.Decimal(exato))).toBe(exato);
  });

  it('converte dentro de objeto', () => {
    const resultado = serializeDecimals({
      sku: 'FER-0001',
      currentStock: new Prisma.Decimal('42'),
      unitCost: new Prisma.Decimal('12.9'),
    });

    // Escalas diferentes no mesmo objeto: quantidade tem 3 casas, dinheiro
    // tem 4, porque é isso que as colunas declaram.
    expect(resultado).toEqual({
      sku: 'FER-0001',
      currentStock: '42.000',
      unitCost: '12.9000',
    });
  });

  it('converte dentro de array', () => {
    const resultado = serializeDecimals([
      { qty: new Prisma.Decimal('1.5') },
      { qty: new Prisma.Decimal('2.5') },
    ]);

    expect(resultado).toEqual([{ qty: '1.5' }, { qty: '2.5' }]);
  });

  it('converte no envelope de paginação, que é o formato real das listagens', () => {
    const resultado = serializeDecimals({
      data: [{ currentStock: new Prisma.Decimal('7.25') }],
      meta: { page: 1, limit: 20, total: 1 },
    });

    expect(resultado).toEqual({
      data: [{ currentStock: '7.250' }],
      meta: { page: 1, limit: 20, total: 1 },
    });
  });

  it('preserva Date, que tem serialização própria', () => {
    const data = new Date('2026-10-20T10:00:00.000Z');
    const resultado = serializeDecimals({ createdAt: data }) as { createdAt: Date };

    expect(resultado.createdAt).toBeInstanceOf(Date);
  });

  it('preserva null e primitivos', () => {
    expect(serializeDecimals({ a: null, b: 1, c: 'x', d: true })).toEqual({
      a: null,
      b: 1,
      c: 'x',
      d: true,
    });
  });

  it('lida com estrutura profunda', () => {
    const resultado = serializeDecimals({
      a: { b: [{ c: { qty: new Prisma.Decimal('3.333') } }] },
    });

    expect(resultado).toEqual({ a: { b: [{ c: { qty: '3.333' } }] } });
  });

  /**
   * A escala é a da COLUNA, não a do valor.
   *
   * `Decimal.toString()` devolve `"0"` para um saldo zero, e o contrato
   * (docs/05-api.md §5.7) promete `"0.000"`. Um cliente que corte a casa
   * decimal por posição, ou compare strings, lê errado.
   */
  describe('escala do contrato', () => {
    it('completa as casas de quantidade', () => {
      expect(serializeDecimals({ currentStock: new Prisma.Decimal('19.5') })).toEqual({
        currentStock: '19.500',
      });
    });

    it('saldo zero sai com as três casas, e não como "0"', () => {
      expect(serializeDecimals({ currentStock: new Prisma.Decimal('0') })).toEqual({
        currentStock: '0.000',
      });
    });

    it('aplica quatro casas a dinheiro', () => {
      expect(serializeDecimals({ unitCost: new Prisma.Decimal('12.5') })).toEqual({
        unitCost: '12.5000',
      });
    });

    it('aplica a escala a todos os campos de quantidade da movimentação', () => {
      const resultado = serializeDecimals({
        quantity: new Prisma.Decimal('12.5'),
        stockBefore: new Prisma.Decimal('40'),
        stockAfter: new Prisma.Decimal('27.5'),
      });

      expect(resultado).toEqual({
        quantity: '12.500',
        stockBefore: '40.000',
        stockAfter: '27.500',
      });
    });

    it('não arredonda: completar zeros não altera o valor', () => {
      // Se `toFixed` cortasse casas significativas, o saldo exibido divergiria
      // do armazenado sem nenhum erro.
      expect(serializeDecimals({ currentStock: new Prisma.Decimal('0.001') })).toEqual({
        currentStock: '0.001',
      });
    });

    it('campo decimal sem escala registrada preserva o valor', () => {
      // Caminho conservador: casa decimal encolhida, nunca valor errado. O
      // teste de contrato contra o schema impede que isso aconteça de fato.
      expect(serializeDecimals({ naoMapeado: new Prisma.Decimal('1.5') })).toEqual({
        naoMapeado: '1.5',
      });
    });
  });
});
