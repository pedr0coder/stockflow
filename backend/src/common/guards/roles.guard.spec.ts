import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { describe, expect, it } from 'vitest';
import { ForbiddenRoleError } from '../errors/auth.errors';
import { UserRole } from '../../generated/prisma/enums';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { RolesGuard } from './roles.guard';
import type { AuthenticatedUser } from '../decorators/current-user.decorator';

/**
 * A matriz de autorização, testada no guard isolado.
 *
 * Este arquivo prova que o guard decide certo. O que ele **não** prova é que
 * o decorator certo foi colocado na rota certa, e esse é um erro comum: o
 * guard pode estar perfeito e a rota ficar aberta por falta de `@Roles()`.
 *
 * Por isso existe também a suíte de integração, que faz requisição real com
 * token de cada papel contra cada rota. As duas se complementam
 * (docs/07-testes.md §7.3 e §7.4).
 */

function makeContext(options: {
  roles?: UserRole[] | undefined;
  isPublic?: boolean;
  user?: AuthenticatedUser | undefined;
}): { guard: RolesGuard; context: ExecutionContext } {
  const reflector = {
    getAllAndOverride: (key: string) => {
      if (key === IS_PUBLIC_KEY) {
        return options.isPublic ?? undefined;
      }
      if (key === ROLES_KEY) {
        return options.roles;
      }
      return undefined;
    },
  } as unknown as Reflector;

  const context = {
    getHandler: () => undefined,
    getClass: () => undefined,
    switchToHttp: () => ({ getRequest: () => ({ user: options.user }) }),
  } as unknown as ExecutionContext;

  return { guard: new RolesGuard(reflector), context };
}

function userWith(role: UserRole): AuthenticatedUser {
  return { id: 'u1', role, tokenId: 't1' };
}

/** Lê a decisão do guard como booleano, traduzindo a exceção em `false`. */
function allows(roles: UserRole[] | undefined, role: UserRole): boolean {
  const { guard, context } = makeContext({ roles, user: userWith(role) });

  try {
    return guard.canActivate(context);
  } catch (error) {
    if (error instanceof ForbiddenRoleError) {
      return false;
    }
    throw error;
  }
}

const ADMIN = UserRole.ADMIN;
const MANAGER = UserRole.MANAGER;
const OPERATOR = UserRole.OPERATOR;

describe('RolesGuard', () => {
  describe('o padrão é negar', () => {
    it('rota pública passa sem usuário nenhum', () => {
      const { guard, context } = makeContext({ isPublic: true });

      expect(guard.canActivate(context)).toBe(true);
    });

    it('rota sem @Roles exige apenas autenticação', () => {
      // "Autenticado basta" é um nível de exigência legítimo: quem quer mais
      // restrição declara no decorator.
      expect(allows(undefined, OPERATOR)).toBe(true);
      expect(allows([], OPERATOR)).toBe(true);
    });

    it('nega quando a requisição chega sem usuário', () => {
      // Não deveria acontecer, porque o JwtAuthGuard roda antes. Se a ordem de
      // registro dos guards for trocada por engano, negar é a resposta segura.
      const { guard, context } = makeContext({ roles: [ADMIN] });

      expect(() => guard.canActivate(context)).toThrow(ForbiddenRoleError);
    });
  });

  describe('matriz de permissões', () => {
    /**
     * Cada linha é uma ação sensível, com o conjunto de papéis que a API
     * declara (docs/05-api.md). A tabela é a especificação executável.
     */
    const matriz: ReadonlyArray<{
      acao: string;
      permitidos: UserRole[];
      esperado: Record<string, boolean>;
    }> = [
      {
        acao: 'ler cadastros',
        permitidos: [ADMIN, MANAGER, OPERATOR],
        esperado: { ADMIN: true, MANAGER: true, OPERATOR: true },
      },
      {
        acao: 'criar produto',
        permitidos: [ADMIN, MANAGER],
        esperado: { ADMIN: true, MANAGER: true, OPERATOR: false },
      },
      {
        acao: 'criar categoria',
        permitidos: [ADMIN, MANAGER],
        esperado: { ADMIN: true, MANAGER: true, OPERATOR: false },
      },
      {
        acao: 'criar fornecedor',
        permitidos: [ADMIN, MANAGER],
        esperado: { ADMIN: true, MANAGER: true, OPERATOR: false },
      },
      {
        acao: 'listar usuários',
        permitidos: [ADMIN, MANAGER],
        esperado: { ADMIN: true, MANAGER: true, OPERATOR: false },
      },
      {
        acao: 'criar usuário',
        permitidos: [ADMIN],
        esperado: { ADMIN: true, MANAGER: false, OPERATOR: false },
      },
      {
        acao: 'alterar papel',
        permitidos: [ADMIN],
        esperado: { ADMIN: true, MANAGER: false, OPERATOR: false },
      },
      {
        acao: 'ler log global de auditoria',
        permitidos: [ADMIN],
        esperado: { ADMIN: true, MANAGER: false, OPERATOR: false },
      },
      {
        acao: 'ler auditoria de uma entidade',
        permitidos: [ADMIN, MANAGER],
        esperado: { ADMIN: true, MANAGER: true, OPERATOR: false },
      },
    ];

    for (const linha of matriz) {
      for (const papel of [ADMIN, MANAGER, OPERATOR]) {
        const esperado = linha.esperado[papel] ?? false;
        const verbo = esperado ? 'permite' : 'nega';

        it(`${verbo} ${papel} em "${linha.acao}"`, () => {
          expect(allows(linha.permitidos, papel)).toBe(esperado);
        });
      }
    }
  });

  describe('o que este teste NÃO prova', () => {
    it('não garante que a rota recebeu o decorator certo', () => {
      // ┌──────────────────────────────────────────────────────────────────┐
      // │ Documentação executável.                                         │
      // │                                                                  │
      // │ Um guard que decide certo não impede que alguém esqueça o        │
      // │ @Roles() em uma rota nova. Nesse caso a rota fica acessível a    │
      // │ qualquer autenticado, e este arquivo continuaria verde.          │
      // │                                                                  │
      // │ Quem cobre isso é a suíte de integração, que percorre a matriz   │
      // │ fazendo requisição real contra cada rota.                        │
      // └──────────────────────────────────────────────────────────────────┘
      expect(allows(undefined, OPERATOR)).toBe(true);
    });
  });
});
