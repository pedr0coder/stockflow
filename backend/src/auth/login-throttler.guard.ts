import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { Request } from 'express';
import { createHash } from 'node:crypto';

/**
 * Rate limit do login, com chave composta por IP **e** e-mail.
 *
 * A escolha da chave é o ponto (docs/08-seguranca.md §8.7):
 *
 * - **só IP** permitiria testar uma senha em mil contas diferentes a partir do
 *   mesmo endereço, sem nunca estourar o limite de nenhuma delas;
 * - **só e-mail** permitiria a qualquer pessoa bloquear a conta de outra, de
 *   propósito, só emitindo tentativas erradas até o limite.
 *
 * Combinando os dois, cada par (origem, conta) tem seu próprio orçamento.
 *
 * O e-mail entra na chave como hash. A chave vira identificador no
 * armazenamento do throttler e pode aparecer em diagnóstico; guardar endereço
 * em claro ali seria dado pessoal espalhado sem necessidade.
 */
@Injectable()
export class LoginThrottlerGuard extends ThrottlerGuard {
  protected override getTracker(req: Request): Promise<string> {
    const ip = req.ip ?? 'desconhecido';
    const body = req.body as { email?: unknown } | undefined;
    const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';

    const emailHash = createHash('sha256').update(email).digest('hex').slice(0, 16);

    return Promise.resolve(`login:${ip}:${emailHash}`);
  }
}
