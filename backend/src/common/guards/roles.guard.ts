import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import type { AuthenticatedUser } from '../decorators/current-user.decorator';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { ForbiddenRoleError } from '../errors/auth.errors';
import type { UserRole } from '../../generated/prisma/enums';

/**
 * Autorização por papel.
 *
 * ┌────────────────────────────────────────────────────────────────────────┐
 * │ ESTE É O PONTO ONDE A AUTORIZAÇÃO ACONTECE DE VERDADE.                │
 * │                                                                        │
 * │ A sidebar do frontend filtra itens por papel, mas aquilo é            │
 * │ conveniência de interface: a rota é alcançável por URL e a API é      │
 * │ chamável por curl. O que protege o sistema é este guard, verificado    │
 * │ por requisição (docs/08-seguranca.md §8.3).                           │
 * └────────────────────────────────────────────────────────────────────────┘
 *
 * Registrado como guard global, **depois** do `JwtAuthGuard`: quando este roda,
 * `request.user` já existe.
 *
 * Rota sem `@Roles()` passa, porque "autenticado basta" é um nível de exigência
 * legítimo. Quem decide que uma rota é mais restrita declara isso no decorator.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic === true) {
      return true;
    }

    const required = this.reflector.getAllAndOverride<UserRole[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (required === undefined || required.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request & { user?: AuthenticatedUser }>();
    const user = request.user;

    if (!user) {
      // Não deveria acontecer: o JwtAuthGuard roda antes. Se acontecer, é erro
      // de ordem de registro dos guards, e negar é a resposta segura.
      throw new ForbiddenRoleError();
    }

    if (!required.includes(user.role)) {
      throw new ForbiddenRoleError();
    }

    return true;
  }
}
