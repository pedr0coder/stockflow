import {
  registerDecorator,
  type ValidationArguments,
  type ValidationOptions,
} from 'class-validator';
import { isPositiveQuantity, isValidFinalQuantity } from './quantity';

/**
 * Decorators de validação para quantidade decimal em string.
 *
 * Separados de `quantity.ts` porque aquele arquivo entra no escopo da regra de
 * lint que proíbe `Number`/`parseFloat`/`Math.*` (docs/17-plano-fase-5.md
 * §17.5.9): mantê-los juntos faria o próprio arquivo de validação do
 * `class-validator` (que lida com `unknown`) acionar a regra à toa.
 */

/** `@IsPositiveQuantity()`: string decimal, até 3 casas, maior que zero. */
export function IsPositiveQuantity(options?: ValidationOptions): PropertyDecorator {
  return function (object: object, propertyName: string | symbol) {
    registerDecorator({
      name: 'isPositiveQuantity',
      target: object.constructor,
      propertyName: propertyName as string,
      ...(options !== undefined ? { options } : {}),
      validator: {
        validate(value: unknown): boolean {
          return typeof value === 'string' && isPositiveQuantity(value);
        },
        defaultMessage(args?: ValidationArguments): string {
          return `${args?.property ?? 'quantidade'} deve ser um decimal maior que zero, com até 3 casas, como "10.000".`;
        },
      },
    });
  };
}

/** `@IsFinalQuantity()`: string decimal, até 3 casas, zero ou mais. */
export function IsFinalQuantity(options?: ValidationOptions): PropertyDecorator {
  return function (object: object, propertyName: string | symbol) {
    registerDecorator({
      name: 'isFinalQuantity',
      target: object.constructor,
      propertyName: propertyName as string,
      ...(options !== undefined ? { options } : {}),
      validator: {
        validate(value: unknown): boolean {
          return typeof value === 'string' && isValidFinalQuantity(value);
        },
        defaultMessage(args?: ValidationArguments): string {
          return `${args?.property ?? 'finalQuantity'} deve ser um decimal com até 3 casas, como "7.000".`;
        },
      },
    });
  };
}
