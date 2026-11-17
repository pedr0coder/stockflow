import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import type { AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { EnvironmentVariables } from '../config/env.validation';
import { UserRole } from '../generated/prisma/enums';
import type { AccessTokenPayload } from './token.service';

const VALID_ROLES = new Set<string>([UserRole.ADMIN, UserRole.MANAGER, UserRole.OPERATOR]);

/**
 * Validação do access token.
 *
 * Três decisões relevantes:
 *
 * `ignoreExpiration: false` deixa a verificação de prazo com a biblioteca, que
 * a faz antes de chamar `validate`. Token expirado nunca chega aqui.
 *
 * O segredo é o de **access**. O refresh tem segredo próprio, e essa separação
 * é o que impede um token de um tipo ser aceito no lugar do outro (ADR-0005).
 * Há teste assinando um token com o segredo errado e exigindo 401.
 *
 * Nenhuma consulta ao banco. Verificar papel e situação do usuário a cada
 * requisição custaria uma consulta por request para fechar uma janela de 15
 * minutos, e esse trade-off já foi decidido no ADR-0005 e registrado na §8.12.
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(config: ConfigService<EnvironmentVariables, true>) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get('JWT_SECRET', { infer: true }),
    });
  }

  /**
   * Converte o payload na identidade que o resto da aplicação usa.
   *
   * O retorno é o que o Passport anexa a `request.user` e o que o
   * `@CurrentUser()` entrega ao handler.
   */
  validate(payload: AccessTokenPayload): AuthenticatedUser {
    if (
      !payload.sub ||
      !payload.role ||
      !payload.jti ||
      payload.sub === 'demo-visitor' ||
      !VALID_ROLES.has(payload.role)
    ) {
      // Token assinado por nós mas sem os campos esperados, ou com identidade de
      // demonstração: em qualquer caso, não dá para confiar nele no servidor.
      throw new UnauthorizedException();
    }

    return { id: payload.sub, role: payload.role, tokenId: payload.jti };
  }
}
