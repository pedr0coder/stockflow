import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ApiBearerAuth,
  ApiCookieAuth,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { CurrentUser, type AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { InvalidRefreshTokenError } from '../common/errors/auth.errors';
import { EnvironmentVariables, NodeEnv } from '../config/env.validation';
import { AuthService } from './auth.service';
import { AuthTokenResponseDto, AuthUserDto } from './dto/auth-response.dto';
import { LoginDto } from './dto/login.dto';
import { LoginThrottlerGuard } from './login-throttler.guard';
import { RefreshThrottlerGuard } from './refresh-throttler.guard';
import { REFRESH_COOKIE_NAME, clearRefreshCookie, setRefreshCookie } from './refresh-cookie';
import { parseDuration } from './token.service';

@ApiTags('Autenticação')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly config: ConfigService<EnvironmentVariables, true>,
  ) {}

  @Public()
  @UseGuards(LoginThrottlerGuard)
  // Cinco tentativas em quinze minutos, por IP e e-mail (§8.7).
  @Throttle({ default: { limit: 5, ttl: 15 * 60 * 1000 } })
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Autentica e inicia a sessão',
    description:
      'Devolve o access token no corpo e grava o refresh em cookie httpOnly. ' +
      'Credencial inválida e e-mail inexistente produzem a mesma resposta, de propósito.',
  })
  @ApiOkResponse({ type: AuthTokenResponseDto })
  @ApiUnauthorizedResponse({ description: 'INVALID_CREDENTIALS ou USER_INACTIVE' })
  @ApiTooManyRequestsResponse({ description: 'Mais de 5 tentativas em 15 minutos' })
  async login(
    @Body() dto: LoginDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthTokenResponseDto> {
    const result = await this.auth.login(dto.email, dto.password, this.contextOf(request));

    this.writeRefreshCookie(response, result.pair.refreshToken);

    return this.toTokenResponse(result.pair.accessToken, result.user);
  }

  @Public()
  @UseGuards(RefreshThrottlerGuard)
  // Trinta por quinze minutos, por endereco (§8.7).
  @Throttle({ default: { limit: 30, ttl: 15 * 60 * 1000 } })
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiCookieAuth(REFRESH_COOKIE_NAME)
  @ApiOperation({
    summary: 'Rotaciona a sessão',
    description:
      'Consome o refresh do cookie, revoga-o e emite um par novo. Apresentar um refresh ' +
      'já rotacionado devolve REFRESH_TOKEN_REUSED e revoga todas as sessões do usuário.',
  })
  @ApiOkResponse({ type: AuthTokenResponseDto })
  @ApiUnauthorizedResponse({ description: 'UNAUTHORIZED ou REFRESH_TOKEN_REUSED' })
  async refresh(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthTokenResponseDto> {
    const presented = this.readRefreshCookie(request);

    if (!presented) {
      throw new InvalidRefreshTokenError();
    }

    const result = await this.auth.refresh(presented, this.contextOf(request));

    this.writeRefreshCookie(response, result.pair.refreshToken);

    return this.toTokenResponse(result.pair.accessToken, result.user);
  }

  /**
   * Encerra a sessão.
   *
   * `@Public()` de propósito: sair não deveria exigir um access token válido.
   * Quem tem o access expirado e o refresh válido também precisa conseguir
   * encerrar a sessão, e exigir autenticação aqui deixaria o refresh vivo no
   * banco justamente no caso em que a pessoa quer se desconectar.
   */
  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiCookieAuth(REFRESH_COOKIE_NAME)
  @ApiOperation({
    summary: 'Encerra a sessão',
    description: 'Revoga o refresh e apaga o cookie. Idempotente: responde 204 mesmo sem cookie.',
  })
  @ApiNoContentResponse()
  async logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    await this.auth.logout(this.readRefreshCookie(request));

    clearRefreshCookie(response, this.isProduction());
  }

  @Get('me')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Usuário da sessão atual' })
  @ApiOkResponse({ type: AuthUserDto })
  @ApiUnauthorizedResponse({ description: 'Token ausente, inválido ou expirado' })
  me(@CurrentUser() user: AuthenticatedUser): Promise<AuthUserDto> {
    // O id vem do token, nunca da URL ou do corpo (docs/08-seguranca.md §8.3).
    return this.auth.me(user.id);
  }

  private readRefreshCookie(request: Request): string | undefined {
    const cookies = request.cookies as Record<string, string | undefined> | undefined;
    return cookies?.[REFRESH_COOKIE_NAME];
  }

  private writeRefreshCookie(response: Response, token: string): void {
    setRefreshCookie(
      response,
      token,
      this.config.get('JWT_REFRESH_TTL', { infer: true }),
      this.isProduction(),
    );
  }

  private toTokenResponse(accessToken: string, user: AuthUserDto): AuthTokenResponseDto {
    return {
      accessToken,
      expiresIn: Math.floor(
        parseDuration(this.config.get('JWT_ACCESS_TTL', { infer: true })) / 1000,
      ),
      user,
    };
  }

  private contextOf(request: Request): { ip?: string; userAgent?: string } {
    const userAgent = request.get('user-agent');

    return {
      ...(request.ip !== undefined ? { ip: request.ip } : {}),
      ...(userAgent !== undefined ? { userAgent } : {}),
    };
  }

  private isProduction(): boolean {
    return this.config.get('NODE_ENV', { infer: true }) === NodeEnv.Production;
  }
}
