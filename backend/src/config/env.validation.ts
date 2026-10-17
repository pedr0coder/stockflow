import { plainToInstance, Transform } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsString,
  Max,
  Min,
  MinLength,
  validateSync,
} from 'class-validator';

/**
 * Tamanho mínimo de um segredo de assinatura.
 *
 * 32 caracteres é o piso para HS256: um segredo mais curto que a saída do
 * próprio hash reduz a entropia efetiva da assinatura. A aplicação recusa
 * subir abaixo disso em vez de avisar e continuar, porque um aviso em log de
 * boot é um aviso que ninguém lê.
 */
export const MIN_SECRET_LENGTH = 32;

export enum NodeEnv {
  Development = 'development',
  Test = 'test',
  Production = 'production',
}

export enum LogLevel {
  Trace = 'trace',
  Debug = 'debug',
  Info = 'info',
  Warn = 'warn',
  Error = 'error',
  Fatal = 'fatal',
}

/**
 * Schema do ambiente.
 *
 * Validado uma única vez, no boot. A aplicação **não sobe** com configuração
 * inválida: é melhor falhar no `docker compose up` do que descobrir em
 * produção que `JWT_SECRET` estava vazio e os tokens eram assináveis por
 * qualquer pessoa.
 *
 * Nenhum campo tem valor padrão de segredo. Um default de desenvolvimento é
 * exatamente o que acaba em produção (docs/08-seguranca.md §8.8).
 */
export class EnvironmentVariables {
  @IsEnum(NodeEnv, { message: 'NODE_ENV deve ser development, test ou production' })
  NODE_ENV!: NodeEnv;

  @Transform(({ value }) => Number.parseInt(String(value ?? '3000'), 10))
  @IsInt({ message: 'PORT deve ser um número inteiro' })
  @Min(1)
  @Max(65535)
  PORT!: number;

  @IsString()
  @IsNotEmpty({ message: 'DATABASE_URL é obrigatória' })
  DATABASE_URL!: string;

  @IsString()
  @MinLength(MIN_SECRET_LENGTH, {
    message: `JWT_SECRET deve ter no mínimo ${MIN_SECRET_LENGTH} caracteres`,
  })
  JWT_SECRET!: string;

  @IsString()
  @MinLength(MIN_SECRET_LENGTH, {
    message: `JWT_REFRESH_SECRET deve ter no mínimo ${MIN_SECRET_LENGTH} caracteres`,
  })
  JWT_REFRESH_SECRET!: string;

  @IsString()
  @IsNotEmpty()
  JWT_ACCESS_TTL!: string;

  @IsString()
  @IsNotEmpty()
  JWT_REFRESH_TTL!: string;

  /**
   * Allowlist de origens do CORS, separada por vírgula.
   *
   * Nunca aceita `*`: além de ser incompatível com cookie de credencial, abriria
   * a API para qualquer site (docs/08-seguranca.md §8.6).
   */
  @IsString()
  @IsNotEmpty({ message: 'CORS_ORIGINS é obrigatória. Use a origem explícita, nunca "*"' })
  CORS_ORIGINS!: string;

  @IsEnum(LogLevel)
  LOG_LEVEL!: LogLevel;
}

/**
 * Erro de configuração. Separado de erro de negócio de propósito: acontece
 * antes de a aplicação existir, então não passa pelo filtro de exceção nem tem
 * código HTTP.
 */
export class EnvironmentValidationError extends Error {
  constructor(public readonly problems: string[]) {
    super(
      [
        'Configuração de ambiente inválida. A aplicação não vai subir.',
        ...problems.map((p) => `  - ${p}`),
        '',
        'Verifique o .env na raiz do repositório (use .env.example como modelo).',
      ].join('\n'),
    );
    this.name = 'EnvironmentValidationError';
  }
}

/**
 * Validador consumido por `ConfigModule.forRoot({ validate })`.
 *
 * Recebe o `process.env` cru e devolve a instância tipada. Qualquer problema
 * vira exceção com a lista completa do que está errado, não apenas o primeiro
 * campo: quem está configurando o projeto corrige tudo de uma vez.
 */
export function validateEnv(raw: Record<string, unknown>): EnvironmentVariables {
  const config = plainToInstance(EnvironmentVariables, raw, {
    enableImplicitConversion: false,
    exposeDefaultValues: true,
  });

  const errors = validateSync(config, {
    skipMissingProperties: false,
    whitelist: false,
    forbidUnknownValues: false,
  });

  const problems = errors.flatMap((error) => Object.values(error.constraints ?? {}));

  /**
   * Checagem que depende de dois campos ao mesmo tempo, e por isso não cabe em
   * um decorator de campo.
   *
   * Segredos iguais para access e refresh anulam a separação: um access token
   * roubado passaria a ser aceito como refresh, e a rotação do ADR-0005
   * deixaria de proteger qualquer coisa.
   */
  if (
    config.JWT_SECRET &&
    config.JWT_REFRESH_SECRET &&
    config.JWT_SECRET === config.JWT_REFRESH_SECRET
  ) {
    problems.push('JWT_SECRET e JWT_REFRESH_SECRET devem ser diferentes entre si');
  }

  if (config.CORS_ORIGINS?.split(',').some((origin) => origin.trim() === '*')) {
    problems.push('CORS_ORIGINS não pode conter "*". Liste as origens explicitamente');
  }

  if (problems.length > 0) {
    throw new EnvironmentValidationError(problems);
  }

  return config;
}

/** Converte `CORS_ORIGINS` na lista que o middleware de CORS espera. */
export function parseCorsOrigins(value: string): string[] {
  return value
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
}
