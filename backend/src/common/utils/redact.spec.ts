import { describe, expect, it } from 'vitest';
import { Prisma } from '../../generated/prisma/client';
import { REDACTED, redactSensitive, toAuditSnapshot } from './redact';

/**
 * Esta função é a única barreira entre o estado de uma entidade e o log de
 * auditoria. Se ela falhar, um hash de senha fica gravado em texto no banco,
 * permanentemente, em uma tabela que por desenho não tem rota de escrita nem
 * de exclusão.
 *
 * Por isso os casos cobrem forma, não apenas o caminho feliz.
 */
describe('redactSensitive', () => {
  it('remove senha e hash no primeiro nível', () => {
    const resultado = redactSensitive({
      id: 'u1',
      email: 'ana@local',
      password: 'senha-em-claro',
      passwordHash: '$argon2id$v=19$...',
    });

    expect(resultado).toEqual({
      id: 'u1',
      email: 'ana@local',
      password: REDACTED,
      passwordHash: REDACTED,
    });
  });

  it('remove em objeto aninhado', () => {
    const resultado = redactSensitive({
      user: { name: 'Ana', passwordHash: 'hash' },
      meta: { nested: { token: 'abc' } },
    });

    expect(resultado).toEqual({
      user: { name: 'Ana', passwordHash: REDACTED },
      meta: { nested: { token: REDACTED } },
    });
  });

  it('remove dentro de array', () => {
    const resultado = redactSensitive([
      { id: 1, secret: 'x' },
      { id: 2, secret: 'y' },
    ]);

    expect(resultado).toEqual([
      { id: 1, secret: REDACTED },
      { id: 2, secret: REDACTED },
    ]);
  });

  it('reconhece a chave independentemente de maiúsculas', () => {
    const resultado = redactSensitive({
      PasswordHash: 'a',
      PASSWORD: 'b',
      RefreshToken: 'c',
      apiKey: 'd',
    });

    expect(resultado).toEqual({
      PasswordHash: REDACTED,
      PASSWORD: REDACTED,
      RefreshToken: REDACTED,
      apiKey: REDACTED,
    });
  });

  it('cobre as chaves sensíveis previstas na §4.4', () => {
    const entrada = {
      password: 1,
      passwordHash: 1,
      token: 1,
      refreshToken: 1,
      accessToken: 1,
      secret: 1,
      authorization: 1,
      apiKey: 1,
    };

    const resultado = redactSensitive(entrada) as Record<string, unknown>;

    for (const chave of Object.keys(entrada)) {
      expect(resultado[chave]).toBe(REDACTED);
    }
  });

  it('preserva null e valores primitivos', () => {
    expect(redactSensitive({ a: null, b: 0, c: false, d: '' })).toEqual({
      a: null,
      b: 0,
      c: false,
      d: '',
    });
  });

  it('preserva Date em vez de desmontá-la', () => {
    const data = new Date('2026-10-20T10:00:00.000Z');
    const resultado = redactSensitive({ createdAt: data }) as { createdAt: Date };

    expect(resultado.createdAt).toBeInstanceOf(Date);
    expect(resultado.createdAt.toISOString()).toBe('2026-10-20T10:00:00.000Z');
  });

  it('não altera o objeto de entrada', () => {
    const entrada = { passwordHash: 'original' };

    redactSensitive(entrada);

    // Mutar a entrada redigiria também a entidade que o chamador está prestes
    // a devolver na resposta HTTP.
    expect(entrada.passwordHash).toBe('original');
  });

  it('não redige chave parecida que não é sensível', () => {
    const resultado = redactSensitive({ passwordPolicy: 'min 10', tokenCount: 3 });

    expect(resultado).toEqual({ passwordPolicy: 'min 10', tokenCount: 3 });
  });

  it('lida com estrutura profunda sem perder nada pelo caminho', () => {
    const resultado = redactSensitive({
      a: { b: { c: { d: { passwordHash: 'x', ok: 'mantido' } } } },
    });

    expect(resultado).toEqual({
      a: { b: { c: { d: { passwordHash: REDACTED, ok: 'mantido' } } } },
    });
  });
});

describe('toAuditSnapshot', () => {
  it('devolve o objeto redigido', () => {
    expect(toAuditSnapshot({ name: 'Ana', passwordHash: 'x' })).toEqual({
      name: 'Ana',
      passwordHash: REDACTED,
    });
  });

  it('devolve undefined para ausência de valor', () => {
    expect(toAuditSnapshot(null)).toBeUndefined();
    expect(toAuditSnapshot(undefined)).toBeUndefined();
  });

  it('devolve undefined para primitivo, que não é estado de entidade', () => {
    expect(toAuditSnapshot('texto')).toBeUndefined();
    expect(toAuditSnapshot(42)).toBeUndefined();
  });
});

/**
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ O caso que apagou a auditoria de produto, em silêncio.                   │
 * │                                                                          │
 * │ `Decimal` do Prisma é objeto, e o percurso genérico o achatava em         │
 * │ `{ constructor, s, e, d }`. O Prisma recusa gravar uma função em coluna   │
 * │ `Json`, o `AuditService.record()` engole a exceção de propósito — para    │
 * │ que falha de log não derrube operação concluída — e o registro            │
 * │ simplesmente não existia. Criar e alterar produto não deixavam rastro.    │
 * │                                                                          │
 * │ Nenhum teste de produto percebeu: todos afirmavam a resposta HTTP, que    │
 * │ estava correta.                                                          │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
describe('redactSensitive com Decimal', () => {
  it('converte Decimal em texto, e não em objeto', () => {
    const resultado = redactSensitive({ currentStock: new Prisma.Decimal('19.5') }) as Record<
      string,
      unknown
    >;

    expect(resultado['currentStock']).toBe('19.500');
  });

  it('não produz as chaves internas do Decimal', () => {
    const serializado = JSON.stringify(redactSensitive({ minStock: new Prisma.Decimal('10') }));

    expect(serializado).not.toContain('constructor');
    expect(serializado).not.toContain('"d":[');
  });

  it('usa a escala do campo, igual à da resposta HTTP', () => {
    // Um log com `10.5` ao lado de uma resposta com `"10.500"` obrigaria quem
    // investiga a decidir qual dos dois é o valor real.
    const resultado = redactSensitive({
      quantity: new Prisma.Decimal('10.5'),
      unitCost: new Prisma.Decimal('10.5'),
    }) as Record<string, unknown>;

    expect(resultado['quantity']).toBe('10.500');
    expect(resultado['unitCost']).toBe('10.5000');
  });

  it('o snapshot inteiro é serializável como JSON', () => {
    const snapshot = toAuditSnapshot({
      sku: 'FER-0001',
      currentStock: new Prisma.Decimal('0'),
      passwordHash: '$argon2id$...',
      createdAt: new Date('2026-10-20T10:00:00.000Z'),
    });

    // É esta chamada que o Prisma faz ao gravar na coluna Json. Antes da
    // correção, ela produzia um valor que o Prisma recusava.
    expect(() => JSON.stringify(snapshot)).not.toThrow();
    expect(snapshot?.['currentStock']).toBe('0.000');
    expect(snapshot?.['passwordHash']).toBe(REDACTED);
  });
});
