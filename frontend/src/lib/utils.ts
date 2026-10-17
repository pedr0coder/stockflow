import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Compõe classes do Tailwind resolvendo conflito entre elas.
 *
 * `clsx` junta e descarta valor falso; `tailwind-merge` resolve o conflito que
 * o `clsx` sozinho deixaria passar: em `"px-2 px-4"` a última ganha no CSS por
 * ordem de declaração, não por ordem na string, então a classe vencedora seria
 * imprevisível. É o utilitário que o shadcn/ui espera encontrar aqui.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
