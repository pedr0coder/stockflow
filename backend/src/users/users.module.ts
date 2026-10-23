import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

/**
 * Importa o AuthModule pelo `TokenService`: alterar papel, inativar e trocar
 * senha precisam revogar sessões, e quem sabe fazer isso é o módulo de
 * autenticação.
 */
@Module({
  imports: [AuthModule],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
