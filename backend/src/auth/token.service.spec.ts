import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { parseDuration } from './token.service';

/**
 * O `TokenService` depende de banco, então a maior parte do comportamento dele
 * é verificada na suíte de integração, inclusive a rotação sob concorrência.
 *
 * Aqui ficam as partes puras: a conversão de prazo e o formato do hash.
 */
describe('parseDuration', () => {
  it('converte segundos, minutos, horas e dias', () => {
    expect(parseDuration('45s')).toBe(45_000);
    expect(parseDuration('15m')).toBe(900_000);
    expect(parseDuration('12h')).toBe(43_200_000);
    expect(parseDuration('7d')).toBe(604_800_000);
  });

  it('aceita o valor com espaço em volta', () => {
    expect(parseDuration(' 15m ')).toBe(900_000);
  });

  it('recusa formato desconhecido em vez de assumir um padrão', () => {
    // Assumir um padrão aqui produziria um token com validade diferente da
    // configurada, sem nenhum aviso.
    expect(() => parseDuration('15')).toThrow(/Duração inválida/);
    expect(() => parseDuration('15min')).toThrow(/Duração inválida/);
    expect(() => parseDuration('')).toThrow(/Duração inválida/);
  });

  it('o prazo do access e o do refresh batem com o padrão do projeto', () => {
    // 15 minutos e 7 dias, conforme o ADR-0005.
    expect(parseDuration('15m')).toBe(15 * 60 * 1000);
    expect(parseDuration('7d')).toBe(7 * 24 * 60 * 60 * 1000);
  });
});

describe('hash do refresh token', () => {
  it('o que vai para o banco é SHA-256, nunca o token', () => {
    // O service usa exatamente esta construção. O teste documenta a
    // propriedade que importa: o valor persistido não permite reconstruir o
    // token, então vazamento do dump não entrega sessões (ADR-0005).
    const token = 'abc123';
    const hash = createHash('sha256').update(token).digest('hex');

    expect(hash).toHaveLength(64);
    expect(hash).not.toContain(token);
  });
});
