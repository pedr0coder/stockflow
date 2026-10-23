import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './jwt.strategy';
import { LoginThrottlerGuard } from './login-throttler.guard';
import { RefreshThrottlerGuard } from './refresh-throttler.guard';
import { TokenService } from './token.service';

/**
 * `JwtModule.register({})` sem segredo de propósito.
 *
 * O segredo é passado em cada chamada de `sign` e lido da configuração
 * validada no boot. Registrá-lo aqui criaria um padrão implícito, e o projeto
 * usa dois segredos distintos (ADR-0005): um default silencioso seria a porta
 * para assinar um token com o segredo errado sem ninguém perceber.
 */
@Module({
  imports: [PassportModule.register({ defaultStrategy: 'jwt' }), JwtModule.register({})],
  controllers: [AuthController],
  providers: [AuthService, TokenService, JwtStrategy, LoginThrottlerGuard, RefreshThrottlerGuard],
  exports: [AuthService, TokenService],
})
export class AuthModule {}
