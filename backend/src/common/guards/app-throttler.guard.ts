import { ExecutionContext, Injectable } from '@nestjs/common';
import { ThrottlerGuard, type ThrottlerRequest } from '@nestjs/throttler';
import type { Request } from 'express';
import type { AuthenticatedUser } from '../decorators/current-user.decorator';

/**
 * Limites gerais da docs/08-seguranca.md §8.7.
 *
 * Leitura é mais generosa que escrita porque o custo e o risco são diferentes:
 * uma listagem repetida desperdiça banco, uma escrita repetida cria registro
 * duplicado.
 */
const READ_LIMIT = 300;
const WRITE_LIMIT = 100;

/** Métodos tratados como leitura. */
const READ_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/** Prefixo das rotas que têm limites próprios, mais estritos. */
const AUTH_PREFIX = '/api/v1/auth';

/**
 * Rate limit geral da API.
 *
 * Duas diferenças em relação ao guard padrão:
 *
 * **A chave é o usuário, não o endereço.** Dentro de uma empresa, dezenas de
 * pessoas saem pelo mesmo IP: limitar por endereço faria o uso normal de uma
 * equipe parecer abuso de uma pessoa. Sem sessão, cai no IP, que é tudo o que
 * existe nesse caso.
 *
 * **O limite depende do método.** Leitura e escrita têm orçamentos separados,
 * conforme a §8.7.
 *
 * As rotas de autenticação são puladas aqui de propósito: elas têm limites
 * próprios e muito mais estritos, aplicados por guards dedicados. Deixar os
 * dois atuando faria o orçamento geral mascarar o específico.
 */
@Injectable()
export class AppThrottlerGuard extends ThrottlerGuard {
  override canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();

    if (request.path?.startsWith(AUTH_PREFIX)) {
      return Promise.resolve(true);
    }

    return super.canActivate(context);
  }

  protected override getTracker(req: Record<string, unknown>): Promise<string> {
    const user = req['user'] as AuthenticatedUser | undefined;

    if (user?.id) {
      return Promise.resolve(`user:${user.id}`);
    }

    const ip = typeof req['ip'] === 'string' ? req['ip'] : 'desconhecido';

    return Promise.resolve(`ip:${ip}`);
  }

  protected override handleRequest(requestProps: ThrottlerRequest): Promise<boolean> {
    const request = requestProps.context.switchToHttp().getRequest<Request>();
    const limit = READ_METHODS.has(request.method) ? READ_LIMIT : WRITE_LIMIT;

    return super.handleRequest({ ...requestProps, limit });
  }
}
