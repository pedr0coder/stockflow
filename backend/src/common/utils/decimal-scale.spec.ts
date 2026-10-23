import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DECIMAL_FIELD_SCALES } from './decimal-scale';

/**
 * Lê as colunas decimais direto do `schema.prisma`.
 *
 * Captura o nome do campo no modelo e a escala declarada em
 * `@db.Decimal(precisão, escala)`. O campo pode ter `@map`, `@default` e o que
 * mais houver entre o nome e o atributo, por isso a linha é casada inteira e
 * não por posição.
 */
function decimalColumnsFromSchema(): Map<string, number> {
  const schema = readFileSync(join(__dirname, '../../../prisma/schema.prisma'), 'utf8');
  const columns = new Map<string, number>();
  const pattern = /^\s*(\w+)\s+Decimal\??\s.*@db\.Decimal\(\s*\d+\s*,\s*(\d+)\s*\)/gm;

  for (const match of schema.matchAll(pattern)) {
    const [, field, scale] = match;

    if (field !== undefined && scale !== undefined) {
      columns.set(field, Number.parseInt(scale, 10));
    }
  }

  return columns;
}

/**
 * Este é um teste de **contrato entre o banco e a API**, e é a razão de o mapa
 * de escalas por nome de campo ser aceitável.
 *
 * Sem ele, a próxima coluna decimal adicionada ao schema sairia na resposta com
 * a escala encolhida (`"0"` em vez de `"0.000"`), e o defeito só apareceria
 * quando alguém comparasse o JSON de uma rota específica com a documentação.
 * Com ele, o schema e o serializador não podem divergir sem vermelho.
 */
describe('DECIMAL_FIELD_SCALES', () => {
  const noSchema = decimalColumnsFromSchema();

  it('encontra as colunas decimais do schema', () => {
    // Guarda contra o próprio parser: se a regex parar de casar, o teste
    // abaixo passaria com um conjunto vazio e não protegeria nada.
    expect(noSchema.size).toBeGreaterThan(0);
  });

  it('registra toda coluna decimal do banco', () => {
    const ausentes = [...noSchema.keys()].filter((field) => !(field in DECIMAL_FIELD_SCALES));

    expect(ausentes).toEqual([]);
  });

  it('usa a mesma escala que a coluna', () => {
    const divergentes = [...noSchema.entries()]
      .filter(([field, scale]) => DECIMAL_FIELD_SCALES[field] !== scale)
      .map(
        ([field, scale]) =>
          `${field}: schema ${String(scale)}, mapa ${String(DECIMAL_FIELD_SCALES[field])}`,
      );

    expect(divergentes).toEqual([]);
  });

  it('não registra campo que não existe no schema', () => {
    // Um nome sobrando aqui aplicaria escala a um campo que não é decimal, ou
    // guardaria a memória de uma coluna já removida.
    const sobrando = Object.keys(DECIMAL_FIELD_SCALES).filter((field) => !noSchema.has(field));

    expect(sobrando).toEqual([]);
  });
});
