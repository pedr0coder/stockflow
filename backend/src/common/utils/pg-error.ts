/**
 * Código SQLSTATE real por trás de um erro do Prisma (docs/17-plano-fase-5.md
 * I19, §17.5.4).
 *
 * ┌────────────────────────────────────────────────────────────────────────────┐
 * │ O `code` de alto nível do Prisma (`P2003`, `P2010`, `P2039`...) não basta,  │
 * │ e às vezes engana. Medido neste projeto: um `RAISE EXCEPTION` comum chega   │
 * │ como `P2039`; uma violação de CHECK como `P2010` ou `P2039` dependendo do   │
 * │ caminho (`$queryRaw` ou o client); e um erro com `ERRCODE` de classe        │
 * │ `restrict_violation` (23xxx) — como o trigger de imutabilidade — o Prisma   │
 * │ o CLASSIFICA COMO `P2003` (violação de chave estrangeira), que é o código   │
 * │ errado e confundiria quem lê o log.                                        │
 * │                                                                            │
 * │ O código verdadeiro do Postgres vem em                                     │
 * │ `error.meta.driverAdapterError.cause.originalCode`, e é essa a única porta │
 * │ confiável. Por isso os triggers do projeto usam SQLSTATE PRÓPRIOS          │
 * │ (`SF001`, `SF002`, fora da faixa padrão do Postgres), para que o código     │
 * │ aqui distinga "é o nosso trigger de imutabilidade" de qualquer outra       │
 * │ `restrict_violation` genérica.                                             │
 * └────────────────────────────────────────────────────────────────────────────┘
 */

interface DriverAdapterErrorShape {
  meta?: { driverAdapterError?: { cause?: { originalCode?: unknown } } };
}

/** SQLSTATE original do Postgres, ou `undefined` se o erro não tiver um. */
export function pgErrorCode(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null) {
    return undefined;
  }

  const code = (error as DriverAdapterErrorShape).meta?.driverAdapterError?.cause?.originalCode;

  return typeof code === 'string' ? code : undefined;
}

/** CHECK violado (`23514`), de qualquer constraint. */
export const PG_CHECK_VIOLATION = '23514';

/** `numeric field overflow`: o valor não cabe na precisão da coluna. */
export const PG_NUMERIC_OVERFLOW = '22003';

/** `stock_movements_immutable`: tentativa de `UPDATE`/`DELETE` no histórico. */
export const PG_STOCK_MOVEMENT_IMMUTABLE = 'SF001';
