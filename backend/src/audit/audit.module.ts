import { Global, Module } from '@nestjs/common';
import { AuditController } from './audit.controller';
import { AuditService } from './audit.service';

/**
 * Global de propósito.
 *
 * Todo módulo de domínio precisa registrar ação na auditoria, e importar este
 * módulo em cada um deles seria uma linha repetida sem informação. É a segunda
 * e última exceção de módulo global no projeto, junto do Prisma.
 */
@Global()
@Module({
  controllers: [AuditController],
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule {}
