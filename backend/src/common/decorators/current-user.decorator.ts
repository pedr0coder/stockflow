import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { UserRole } from '../../generated/prisma/enums';

/**
 * Identidade extraída do access token.
 *
 * É o que o `JwtStrategy` devolve e o que o Passport anexa à requisição.
 * Contém apenas o que está no token: id, papel e o identificador do próprio
 * token. Nada de e-mail ou nome, porque o payload do JWT não os carrega
 * (ADR-0005).
 */
export interface AuthenticatedUser {
  /** `sub` do token: id do usuário. */
  id: string;
  role: UserRole;
  /** `jti` do token, para correlacionar com o log. */
  tokenId: string;
}

/**
 * Injeta o usuário autenticado no handler.
 *
 * Existe para que o controller não precise tocar em `Request`, e para que o
 * service continue sem conhecer HTTP (docs/02-arquitetura.md §2.3). O service
 * recebe um id, não uma requisição.
 *
 * É também o que garante a regra da §8.3: operações sobre "o próprio usuário"
 * usam o id **do token**, nunca um id vindo do corpo ou da URL.
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedUser => {
    const request = context.switchToHttp().getRequest<Request & { user?: AuthenticatedUser }>();

    if (!request.user) {
      // Só acontece se o decorator for usado em rota pública. É erro de
      // programação, e falhar alto é melhor que devolver undefined e quebrar
      // três camadas adiante.
      throw new Error('@CurrentUser() usado em rota sem autenticação.');
    }

    return request.user;
  },
);
