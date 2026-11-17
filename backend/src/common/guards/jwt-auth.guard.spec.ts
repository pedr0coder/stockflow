import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { describe, expect, it, vi } from 'vitest';
import { JwtStrategy } from '../../auth/jwt.strategy';
import { UserRole } from '../../generated/prisma/enums';
import { JwtAuthGuard } from './jwt-auth.guard';

function makeContext(headers: Record<string, string> = {}): ExecutionContext {
  return {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({
      getRequest: () => ({ headers }),
    }),
  } as unknown as ExecutionContext;
}

describe('Segurança de Backend contra Modo Demonstração / Visitante (Fase 9)', () => {
  it('JwtAuthGuard rejeita imediatamente requisições com cabeçalho x-demo-mode ou x-visitor-mode', () => {
    const reflector = {
      getAllAndOverride: vi.fn().mockReturnValue(false),
    } as unknown as Reflector;
    const guard = new JwtAuthGuard(reflector);

    expect(() => guard.canActivate(makeContext({ 'x-demo-mode': 'true' }))).toThrow(
      UnauthorizedException,
    );
    expect(() => guard.canActivate(makeContext({ 'x-visitor-mode': 'Ana' }))).toThrow(
      UnauthorizedException,
    );
  });

  it('JwtStrategy rejeita payload com sub="demo-visitor" ou papel inválido', () => {
    const config = {
      get: vi.fn().mockReturnValue('segredo_de_teste_com_mais_de_32_caracteres_000'),
    } as unknown as ConfigService<never, true>;
    const strategy = new JwtStrategy(config);

    expect(() =>
      strategy.validate({
        sub: 'demo-visitor',
        role: UserRole.MANAGER,
        jti: 'jti-123',
      }),
    ).toThrow(UnauthorizedException);

    expect(() =>
      strategy.validate({
        sub: 'user-123',
        role: 'VISITOR' as UserRole,
        jti: 'jti-123',
      }),
    ).toThrow(UnauthorizedException);
  });

  it('JwtStrategy aceita payload válido de conta real autenticada', () => {
    const config = {
      get: vi.fn().mockReturnValue('segredo_de_teste_com_mais_de_32_caracteres_000'),
    } as unknown as ConfigService<never, true>;
    const strategy = new JwtStrategy(config);

    const user = strategy.validate({
      sub: '01950000-0000-7000-8000-000000000001',
      role: UserRole.MANAGER,
      jti: '01950000-0000-7000-8000-000000000002',
    });

    expect(user).toEqual({
      id: '01950000-0000-7000-8000-000000000001',
      role: UserRole.MANAGER,
      tokenId: '01950000-0000-7000-8000-000000000002',
    });
  });
});
