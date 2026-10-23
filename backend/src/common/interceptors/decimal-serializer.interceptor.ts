import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { map, type Observable } from 'rxjs';
import { Prisma } from '../../generated/prisma/client';
import { formatDecimalField } from '../utils/decimal-scale';

/**
 * Converte `Decimal` em string antes de a resposta virar JSON.
 *
 * ┌────────────────────────────────────────────────────────────────────────┐
 * │ Sem isto, a API devolve lixo.                                          │
 * │                                                                        │
 * │ O `Decimal` do Prisma não tem `toJSON`, então `JSON.stringify` cai na  │
 * │ representação interna do objeto:                                       │
 * │                                                                        │
 * │   "currentStock": { "s": 1, "e": 1, "d": [10] }                        │
 * │                                                                        │
 * │ O contrato (docs/05-api.md §5.7) exige string, e por um motivo que não │
 * │ é estético: `number` em JavaScript é IEEE-754, então converter para    │
 * │ número perderia precisão em quantidade e custo, que é exatamente o que │
 * │ o `Decimal` no banco existe para evitar.                               │
 * └────────────────────────────────────────────────────────────────────────┘
 *
 * Por que um interceptor global e não conversão em cada service: converter
 * caso a caso garantiria que algum endpoint ficaria de fora, e o defeito só
 * apareceria quando alguém olhasse o JSON daquela rota específica. Aqui a
 * garantia é estrutural.
 *
 * Alternativa avaliada e recusada: redefinir `Decimal.prototype.toJSON` no
 * boot. Funcionaria em uma linha, mas alterar o protótipo de uma classe de
 * biblioteca afeta todo o processo, inclusive código que espera o
 * comportamento original, e não aparece em nenhuma busca por "serialização".
 */
@Injectable()
export class DecimalSerializerInterceptor implements NestInterceptor {
  intercept(_context: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(map((value) => serializeDecimals(value)));
  }
}

/**
 * Percorre a estrutura convertendo `Decimal` em string.
 *
 * Exportada para teste direto: a conversão é a parte que importa, e ela é
 * verificável sem subir um servidor.
 */
export function serializeDecimals(value: unknown, field?: string): unknown {
  if (Prisma.Decimal.isDecimal(value)) {
    return formatDecimalField(value, field);
  }

  if (Array.isArray(value)) {
    // O nome do campo atravessa o array: em `{ items: [...] }` quem carrega a
    // escala é `items`, e cada elemento do array é do mesmo campo.
    return value.map((item) => serializeDecimals(item, field));
  }

  // Date é objeto, mas tem serialização própria. Recriá-la campo a campo a
  // destruiria.
  if (value instanceof Date || value === null || typeof value !== 'object') {
    return value;
  }

  const result: Record<string, unknown> = {};

  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    result[key] = serializeDecimals(item, key);
  }

  return result;
}
