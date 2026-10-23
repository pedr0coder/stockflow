import { ExecutionContext, Injectable } from '@nestjs/common';
import type { Observable } from 'rxjs';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

/**
 * Exige um access token válido, salvo em rota marcada com `@Public()`.
 *
 * Registrado como guard **global**. O padrão é negar: qualquer rota nova nasce
 * protegida, e abrir exige o decorator explícito (docs/08-seguranca.md §8.3).
 *
 * A consulta ao metadado considera handler e classe, nesta ordem, para que
 * `@Public()` funcione tanto em um método quanto em um controller inteiro.
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  override canActivate(
    context: ExecutionContext,
  ): boolean | Promise<boolean> | Observable<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic === true) {
      return true;
    }

    return super.canActivate(context);
  }
}
