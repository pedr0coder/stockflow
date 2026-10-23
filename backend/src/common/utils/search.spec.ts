import { describe, expect, it } from 'vitest';
import { escapeLikeWildcards } from './like';
import { searchTerm } from './search';

/**
 * `%` e `_` são curingas dentro do padrão do `LIKE`, e o `contains` do Prisma
 * não os escapa. Sem isto, `?search=%` casava com tudo: o filtro deixava de
 * ser filtro, e procurar "Desconto 50%" devolvia o catálogo inteiro.
 */
describe('escapeLikeWildcards', () => {
  it('escapa o curinga de vários caracteres', () => {
    expect(escapeLikeWildcards('50%')).toBe('50\\%');
  });

  it('escapa o curinga de um caractere', () => {
    expect(escapeLikeWildcards('a_c')).toBe('a\\_c');
  });

  it('escapa a própria barra invertida', () => {
    expect(escapeLikeWildcards('a\\b')).toBe('a\\\\b');
  });

  it('escapa a barra ANTES dos curingas, sem duplicar o que acabou de inserir', () => {
    // Na ordem inversa, o `\` inserido ao escapar `%` seria escapado de novo e
    // o padrão passaria a procurar uma barra literal que não existe.
    expect(escapeLikeWildcards('\\%')).toBe('\\\\\\%');
  });

  it('não altera termo comum', () => {
    expect(escapeLikeWildcards('chave de fenda')).toBe('chave de fenda');
  });

  it('preserva acento e maiúscula: a normalização é do banco, não daqui', () => {
    expect(escapeLikeWildcards('Elétrica')).toBe('Elétrica');
  });
});

describe('searchTerm', () => {
  it('devolve undefined sem busca', () => {
    expect(searchTerm(undefined)).toBeUndefined();
  });

  it('devolve undefined para string vazia', () => {
    // Com `contains`, string vazia casaria com tudo. Omitir a cláusula é
    // diferente de filtrar por nada.
    expect(searchTerm('')).toBeUndefined();
  });

  it('escapa o termo recebido', () => {
    expect(searchTerm('100%')).toBe('100\\%');
  });
});
