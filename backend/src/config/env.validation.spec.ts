import { describe, expect, it } from 'vitest';
import {
  EnvironmentValidationError,
  MIN_SECRET_LENGTH,
  parseCorsOrigins,
  validateEnv,
} from './env.validation';

/** Base válida. Cada teste quebra exatamente um campo a partir dela. */
function validEnv(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    NODE_ENV: 'development',
    PORT: '3000',
    DATABASE_URL: 'postgresql://user:pass@localhost:5432/stockflow?schema=public',
    JWT_SECRET: 'a'.repeat(MIN_SECRET_LENGTH),
    JWT_REFRESH_SECRET: 'b'.repeat(MIN_SECRET_LENGTH),
    JWT_ACCESS_TTL: '15m',
    JWT_REFRESH_TTL: '7d',
    CORS_ORIGINS: 'http://localhost:5173',
    LOG_LEVEL: 'debug',
    ...overrides,
  };
}

/** Lista de problemas de uma chamada que deve falhar. */
function problemsOf(env: Record<string, unknown>): string[] {
  try {
    validateEnv(env);
  } catch (error) {
    if (error instanceof EnvironmentValidationError) {
      return error.problems;
    }
    throw error;
  }
  throw new Error('esperava EnvironmentValidationError, mas a validação passou');
}

describe('validateEnv', () => {
  it('aceita um ambiente completo e converte PORT para número', () => {
    const env = validateEnv(validEnv());

    expect(env.PORT).toBe(3000);
    expect(typeof env.PORT).toBe('number');
    expect(env.NODE_ENV).toBe('development');
  });

  it('recusa DATABASE_URL ausente', () => {
    const problems = problemsOf(validEnv({ DATABASE_URL: undefined }));

    expect(problems.join(' ')).toContain('DATABASE_URL');
  });

  it('recusa segredo mais curto que o mínimo', () => {
    const problems = problemsOf(validEnv({ JWT_SECRET: 'curto' }));

    expect(problems.join(' ')).toContain('JWT_SECRET');
    expect(problems.join(' ')).toContain(String(MIN_SECRET_LENGTH));
  });

  it('aceita segredo exatamente no tamanho mínimo', () => {
    expect(() =>
      validateEnv(validEnv({ JWT_SECRET: 'x'.repeat(MIN_SECRET_LENGTH) })),
    ).not.toThrow();
  });

  it('recusa JWT_SECRET igual a JWT_REFRESH_SECRET', () => {
    const same = 'z'.repeat(MIN_SECRET_LENGTH);
    const problems = problemsOf(validEnv({ JWT_SECRET: same, JWT_REFRESH_SECRET: same }));

    expect(problems.join(' ')).toContain('devem ser diferentes');
  });

  it('recusa CORS_ORIGINS com curinga', () => {
    const problems = problemsOf(validEnv({ CORS_ORIGINS: '*' }));

    expect(problems.join(' ')).toContain('CORS_ORIGINS');
  });

  it('recusa curinga mesmo misturado a origens válidas', () => {
    const problems = problemsOf(validEnv({ CORS_ORIGINS: 'http://localhost:5173, *' }));

    expect(problems.join(' ')).toContain('CORS_ORIGINS');
  });

  it('recusa NODE_ENV fora dos valores previstos', () => {
    const problems = problemsOf(validEnv({ NODE_ENV: 'staging' }));

    expect(problems.join(' ')).toContain('NODE_ENV');
  });

  it('recusa PORT fora da faixa de porta', () => {
    expect(problemsOf(validEnv({ PORT: '0' })).join(' ')).toContain('PORT');
    expect(problemsOf(validEnv({ PORT: '70000' })).join(' ')).toContain('PORT');
  });

  it('recusa PORT não numérica', () => {
    expect(problemsOf(validEnv({ PORT: 'abc' })).join(' ')).toContain('PORT');
  });

  it('reporta todos os problemas de uma vez, não apenas o primeiro', () => {
    const problems = problemsOf(
      validEnv({ DATABASE_URL: '', JWT_SECRET: 'curto', NODE_ENV: 'nada' }),
    );

    // Quem está configurando o projeto corrige tudo em uma passada.
    expect(problems.length).toBeGreaterThanOrEqual(3);
  });

  it('não vaza valor de segredo na mensagem de erro', () => {
    const secret = 'segredo-que-nao-pode-aparecer-no-log-123456';
    const message = problemsOf(validEnv({ JWT_SECRET: secret, JWT_REFRESH_SECRET: secret })).join(
      ' ',
    );

    expect(message).not.toContain(secret);
  });
});

describe('parseCorsOrigins', () => {
  it('separa por vírgula e remove espaço em volta', () => {
    expect(parseCorsOrigins('http://a.com , http://b.com')).toEqual([
      'http://a.com',
      'http://b.com',
    ]);
  });

  it('descarta entrada vazia resultante de vírgula sobrando', () => {
    expect(parseCorsOrigins('http://a.com,,')).toEqual(['http://a.com']);
  });
});
