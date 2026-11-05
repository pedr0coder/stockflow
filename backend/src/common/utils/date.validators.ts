import { isDateString, registerDecorator, type ValidationOptions } from 'class-validator';

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const DATE_PREFIX_PATTERN = /^(\d{4}-\d{2}-\d{2})T/;

/**
 * Verifica se uma data `YYYY-MM-DD` existe de fato no calendário Gregoriano
 * (sem sofrer rollover silencioso no V8, como `'2026-02-31'` virando `'2026-03-03'`).
 */
function isRealCalendarDate(datePart: string): boolean {
  if (!DATE_ONLY_PATTERN.test(datePart)) {
    return false;
  }

  const parsed = new Date(`${datePart}T00:00:00.000Z`);

  if (Number.isNaN(parsed.getTime())) {
    return false;
  }

  return parsed.toISOString().slice(0, 10) === datePart;
}

/**
 * Valida se `value` é uma data ISO 8601 estrita aceita pelos filtros de
 * período (`YYYY-MM-DD` real ou data-e-hora ISO 8601 com separador `T`,
 * com ou sem sufixo de fuso horário `Z` / `±HH:MM`) e que produz um `Date`
 * finito no JavaScript (Marco 7B / M7B-4).
 *
 * Rejeita formatos ISO que geram `Invalid Date` no V8 e causariam HTTP 500 no
 * driver PostgreSQL (como semanas `'2026-W01'`, formato básico sem hífens
 * `'20260101'` ou apenas ano-mês `'2026-10'`), bem como datas inexistentes no
 * calendário (`'2026-02-29'`, `'2026-02-31'`, `'2026-04-31'`).
 */
export function isIsoDateOrDateTimeString(value: unknown): value is string {
  if (typeof value !== 'string') {
    return false;
  }

  if (DATE_ONLY_PATTERN.test(value)) {
    return isRealCalendarDate(value);
  }

  const prefixMatch = DATE_PREFIX_PATTERN.exec(value);
  const datePart = prefixMatch?.[1];

  if (!datePart || !isRealCalendarDate(datePart)) {
    return false;
  }

  if (!isDateString(value, { strict: true, strictSeparator: true })) {
    return false;
  }

  return !Number.isNaN(new Date(value).getTime());
}

/**
 * Decorator de `class-validator` para campos `dateFrom` / `dateTo`.
 */
export function IsIsoDateOrDateTime(validationOptions?: ValidationOptions): PropertyDecorator {
  return (target: object, propertyKey: string | symbol) => {
    registerDecorator({
      name: 'isIsoDateOrDateTime',
      target: target.constructor,
      propertyName: String(propertyKey),
      ...(validationOptions !== undefined ? { options: validationOptions } : {}),
      validator: {
        validate(value: unknown): boolean {
          return isIsoDateOrDateTimeString(value);
        },
        defaultMessage(): string {
          return '$property deve ser uma data ISO 8601 válida.';
        },
      },
    });
  };
}
