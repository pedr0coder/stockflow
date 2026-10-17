import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

/**
 * Global de propósito.
 *
 * Todo módulo de domínio precisa do banco. Importar `PrismaModule` em cada um
 * deles seria uma linha repetida sem informação: a dependência existe em todos.
 * É a única exceção de módulo global no projeto, e ela está aqui para não haver
 * dúvida sobre onde o cliente Prisma é instanciado.
 */
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
