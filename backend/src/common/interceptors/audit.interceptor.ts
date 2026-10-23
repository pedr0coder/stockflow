import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import type { Request } from 'express';
import type { Observable } from 'rxjs';
import { auditContextStorage, type AuditContext } from '../../audit/audit-context';
import type { AuthenticatedUser } from '../decorators/current-user.decorator';

/**
 * Abre o escopo de contexto da auditoria para cada requisição.
 *
 * Este interceptor **não grava nada**. Ele apenas disponibiliza quem está
 * fazendo a requisição, de onde e com qual cliente, para que o `AuditService`
 * possa registrar isso sem que os services precisem receber um `Request`.
 *
 * Por que não gravar aqui: gravar no interceptor obrigaria a adivinhar o que
 * aconteceu a partir do método HTTP e do corpo da resposta, e o estado
 * anterior de uma entidade nem chega até aqui. O service que executou a
 * mudança é quem sabe o que mudou, então é ele que chama o registro.
 *
 * O que o interceptor dá é justamente o que o service não tem.
 */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') {
      return next.handle();
    }

    const request = context.switchToHttp().getRequest<Request & { user?: AuthenticatedUser }>();

    const store: AuditContext = {
      ...(request.user?.id !== undefined ? { actorId: request.user.id } : {}),
      ...(request.user?.role !== undefined ? { actorRole: request.user.role } : {}),
      ...(request.ip !== undefined ? { ip: request.ip } : {}),
      ...(request.get('user-agent') !== undefined ? { userAgent: request.get('user-agent') } : {}),
    };

    return auditContextStorage.run(store, () => next.handle());
  }
}
