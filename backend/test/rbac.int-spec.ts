import { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PrismaService } from '../src/prisma/prisma.service';
import { UserRole } from '../src/generated/prisma/enums';
import {
  bearer,
  createCategory,
  createProduct,
  createSession,
  createSupplier,
  createTestApp,
  createUser,
  login,
  type Session,
  type TestApp,
} from './helpers/app';

/**
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ A MATRIZ DE PERMISSÃO, VERIFICADA POR REQUISIÇÃO REAL.                   │
 * │                                                                          │
 * │ Testar o `RolesGuard` isolado provaria que o guard compara papéis. Não   │
 * │ provaria que ele está PLUGADO na rota, que é o defeito que de fato       │
 * │ acontece: alguém adiciona um endpoint e esquece o `@Roles`. Com o guard  │
 * │ global e padrão de negar, esquecer o decorator fecha a rota em vez de    │
 * │ abri-la — e é exatamente isso que esta suíte confirma, caso a caso.      │
 * │                                                                          │
 * │ Cada linha abaixo é uma requisição HTTP contra a app real, com token     │
 * │ real emitido pelo login real. O que se afirma é o status.                │
 * └──────────────────────────────────────────────────────────────────────────┘
 */

/** Papéis que NÃO têm acesso, por rota. O complemento é testado como 2xx. */
interface MatrixRow {
  method: 'get' | 'post' | 'patch';
  path: string;
  /** Papéis autorizados. Os demais precisam receber 403. */
  allow: UserRole[];
  /** Corpo mínimo para a requisição passar da validação até o guard. */
  body?: Record<string, unknown>;
}

describe('RBAC (integração)', () => {
  let harness: TestApp;
  let app: NestExpressApplication;
  let prisma: PrismaService;

  let admin: Session;
  let manager: Session;
  let operator: Session;

  beforeAll(async () => {
    harness = await createTestApp();
    app = harness.app;
    prisma = harness.prisma;
  });

  afterAll(async () => {
    await harness.close();
  });

  /**
   * As sessões são criadas uma vez por caso, e o truncate acontece antes.
   *
   * Reaproveitar sessões entre casos quebraria no truncate: o usuário
   * desapareceria do banco e o token continuaria assinado, o que testaria um
   * cenário diferente do pretendido.
   */
  beforeEach(async () => {
    await prisma.$executeRawUnsafe(`
      TRUNCATE TABLE
        audit_logs, refresh_tokens, stock_movements, inventory_items,
        inventories, products, categories, suppliers, users
      RESTART IDENTITY CASCADE
    `);

    admin = await createSession(app, prisma, UserRole.ADMIN);
    manager = await createSession(app, prisma, UserRole.MANAGER);
    operator = await createSession(app, prisma, UserRole.OPERATOR);
  });

  function sessionFor(role: UserRole): Session {
    if (role === UserRole.ADMIN) return admin;
    if (role === UserRole.MANAGER) return manager;
    return operator;
  }

  describe('sem token, nenhuma rota de negócio responde', () => {
    const rotasProtegidas: { method: 'get' | 'post' | 'patch'; path: string }[] = [
      { method: 'get', path: '/api/v1/auth/me' },
      { method: 'get', path: '/api/v1/users' },
      { method: 'post', path: '/api/v1/users' },
      { method: 'patch', path: '/api/v1/users/me/password' },
      { method: 'get', path: '/api/v1/categories' },
      { method: 'post', path: '/api/v1/categories' },
      { method: 'get', path: '/api/v1/suppliers' },
      { method: 'post', path: '/api/v1/suppliers' },
      { method: 'get', path: '/api/v1/products' },
      { method: 'post', path: '/api/v1/products' },
      { method: 'get', path: '/api/v1/audit' },
    ];

    it.each(rotasProtegidas)('401 em $method $path', async ({ method, path }) => {
      const response = await request(app.getHttpServer())[method](path).send({});

      expect(response.status).toBe(401);
    });

    it('401 e não 403: sem identidade não há o que autorizar', async () => {
      const response = await request(app.getHttpServer()).get('/api/v1/users');

      expect(response.status).toBe(401);
      expect(response.body.code).toBe('UNAUTHORIZED');
    });

    it('token malformado não passa', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/products')
        .set('Authorization', 'Bearer nao-e-um-jwt');

      expect(response.status).toBe(401);
    });

    it('header sem o esquema Bearer não passa', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/products')
        .set('Authorization', admin.accessToken);

      expect(response.status).toBe(401);
    });
  });

  describe('matriz de papéis', () => {
    /**
     * Rotas sem parâmetro de id. As com `:id` são testadas em seguida, com um
     * recurso de verdade criado antes, para que um 404 não se confunda com um
     * 403.
     */
    const matriz: MatrixRow[] = [
      // Usuários: cadastro é exclusivo do ADMIN; leitura é ADMIN e MANAGER.
      { method: 'get', path: '/api/v1/users', allow: [UserRole.ADMIN, UserRole.MANAGER] },
      {
        method: 'post',
        path: '/api/v1/users',
        allow: [UserRole.ADMIN],
        body: {
          name: 'Pessoa Nova',
          email: 'nova-pessoa-rbac@teste.local',
          password: 'senha-de-teste-123',
          role: UserRole.OPERATOR,
        },
      },

      // Cadastros: leitura para os três papéis, escrita para ADMIN e MANAGER.
      { method: 'get', path: '/api/v1/categories', allow: [...Object.values(UserRole)] },
      {
        method: 'post',
        path: '/api/v1/categories',
        allow: [UserRole.ADMIN, UserRole.MANAGER],
        body: { name: 'Categoria RBAC' },
      },
      { method: 'get', path: '/api/v1/suppliers', allow: [...Object.values(UserRole)] },
      {
        method: 'post',
        path: '/api/v1/suppliers',
        allow: [UserRole.ADMIN, UserRole.MANAGER],
        body: { name: 'Fornecedor RBAC' },
      },
      { method: 'get', path: '/api/v1/products', allow: [...Object.values(UserRole)] },

      // Movimentações de estoque (Fase 5, marco 5A): histórico global para os
      // três papéis. O ajuste manual (ADMIN e MANAGER, ADR-0003) depende de
      // um produto real e é testado à parte, em "matriz nas rotas com id".
      { method: 'get', path: '/api/v1/stock-movements', allow: [...Object.values(UserRole)] },

      // Auditoria global: só ADMIN.
      { method: 'get', path: '/api/v1/audit', allow: [UserRole.ADMIN] },
    ];

    const casos = matriz.flatMap((row) =>
      Object.values(UserRole).map((role) => ({
        ...row,
        role,
        permitido: row.allow.includes(role),
      })),
    );

    it.each(casos)(
      '$role em $method $path: permitido=$permitido',
      async ({ method, path, body, role, permitido }) => {
        const session = sessionFor(role);

        const response = await request(app.getHttpServer())
          [method](path)
          .set('Authorization', bearer(session))
          // O corpo leva sufixo por papel: três papéis postam a mesma rota no
          // mesmo caso, e e-mail e nome são únicos no banco.
          .send(body === undefined ? {} : comSufixo(body, role));

        if (permitido) {
          expect(response.status).toBeLessThan(400);
        } else {
          expect(response.status).toBe(403);
          expect(response.body.code).toBe('FORBIDDEN_ROLE');
        }
      },
    );
  });

  describe('matriz nas rotas com id', () => {
    it('OPERATOR não altera categoria existente', async () => {
      const categoria = await createCategory(prisma);

      const response = await request(app.getHttpServer())
        .patch(`/api/v1/categories/${categoria.id}`)
        .set('Authorization', bearer(operator))
        .send({ name: 'Tentativa' });

      expect(response.status).toBe(403);
    });

    it('MANAGER altera categoria existente', async () => {
      const categoria = await createCategory(prisma);

      const response = await request(app.getHttpServer())
        .patch(`/api/v1/categories/${categoria.id}`)
        .set('Authorization', bearer(manager))
        .send({ name: 'Nome novo' });

      expect(response.status).toBe(200);
    });

    it('OPERATOR não inativa produto', async () => {
      const categoria = await createCategory(prisma);
      const produto = await createProduct(prisma, categoria.id);

      const response = await request(app.getHttpServer())
        .patch(`/api/v1/products/${produto.id}/status`)
        .set('Authorization', bearer(operator))
        .send({ isActive: false });

      expect(response.status).toBe(403);
    });

    it('OPERATOR não altera fornecedor', async () => {
      const fornecedor = await createSupplier(prisma);

      const response = await request(app.getHttpServer())
        .patch(`/api/v1/suppliers/${fornecedor.id}`)
        .set('Authorization', bearer(operator))
        .send({ name: 'Tentativa' });

      expect(response.status).toBe(403);
    });

    it('MANAGER não altera papel de ninguém, nem com id válido', async () => {
      const alvo = await createUser(prisma, UserRole.OPERATOR);

      const response = await request(app.getHttpServer())
        .patch(`/api/v1/users/${alvo.id}/role`)
        .set('Authorization', bearer(manager))
        .send({ role: UserRole.ADMIN });

      expect(response.status).toBe(403);
    });

    it('MANAGER não inativa usuário', async () => {
      const alvo = await createUser(prisma, UserRole.OPERATOR);

      const response = await request(app.getHttpServer())
        .patch(`/api/v1/users/${alvo.id}/status`)
        .set('Authorization', bearer(manager))
        .send({ isActive: false });

      expect(response.status).toBe(403);
    });

    it('MANAGER lê o histórico de uma entidade, que o ADMIN também lê', async () => {
      const categoria = await createCategory(prisma);

      for (const session of [admin, manager]) {
        const response = await request(app.getHttpServer())
          .get(`/api/v1/audit/Category/${categoria.id}`)
          .set('Authorization', bearer(session));

        expect(response.status).toBe(200);
      }
    });

    it('OPERATOR não lê o histórico de entidade nenhuma', async () => {
      const categoria = await createCategory(prisma);

      const response = await request(app.getHttpServer())
        .get(`/api/v1/audit/Category/${categoria.id}`)
        .set('Authorization', bearer(operator));

      expect(response.status).toBe(403);
    });

    /**
     * Ajuste manual de estoque: só ADMIN e MANAGER (ADR-0003, "autorização
     * explícita" para alterar o saldo fora de uma entrada/saída físicas).
     */
    it('OPERATOR não ajusta o saldo manualmente', async () => {
      const categoria = await createCategory(prisma);
      const produto = await createProduct(prisma, categoria.id, { currentStock: '10.000' });

      const response = await request(app.getHttpServer())
        .post('/api/v1/stock-movements/adjustment')
        .set('Authorization', bearer(operator))
        .send({
          productId: produto.id,
          finalQuantity: '5.000',
          reason: 'CORRECTION',
          note: 'Tentativa RBAC',
        });

      expect(response.status).toBe(403);
      expect(response.body.code).toBe('FORBIDDEN_ROLE');
    });

    it.each([UserRole.ADMIN, UserRole.MANAGER])('%s ajusta o saldo manualmente', async (role) => {
      const categoria = await createCategory(prisma);
      const produto = await createProduct(prisma, categoria.id, { currentStock: '10.000' });
      const session = sessionFor(role);

      const response = await request(app.getHttpServer())
        .post('/api/v1/stock-movements/adjustment')
        .set('Authorization', bearer(session))
        .send({
          productId: produto.id,
          finalQuantity: '5.000',
          reason: 'CORRECTION',
          note: `RBAC ${role}`,
        });

      expect(response.status).toBe(201);
    });

    it.each(Object.values(UserRole))('%s registra entrada e saída de estoque', async (role) => {
      const categoria = await createCategory(prisma);
      const produto = await createProduct(prisma, categoria.id, { currentStock: '10.000' });
      const session = sessionFor(role);

      const entrada = await request(app.getHttpServer())
        .post('/api/v1/stock-movements/in')
        .set('Authorization', bearer(session))
        .send({ productId: produto.id, quantity: '1.000', reason: 'PURCHASE' });
      expect(entrada.status).toBe(201);

      const saida = await request(app.getHttpServer())
        .post('/api/v1/stock-movements/out')
        .set('Authorization', bearer(session))
        .send({ productId: produto.id, quantity: '1.000', reason: 'SALE' });
      expect(saida.status).toBe(201);
    });
  });

  /**
   * O 403 vem ANTES de o recurso ser consultado.
   *
   * Se a autorização rodasse depois da busca, a diferença entre 403 e 404
   * diria a quem não tem permissão se um id existe. É vazamento por canal
   * lateral, e o teste fixa a ordem.
   */
  describe('autorização antes da existência', () => {
    it('403 para id inexistente, não 404', async () => {
      const inexistente = '0199a000-0000-7000-8000-000000000000';

      const response = await request(app.getHttpServer())
        .patch(`/api/v1/categories/${inexistente}`)
        .set('Authorization', bearer(operator))
        .send({ name: 'x' });

      expect(response.status).toBe(403);
    });

    it('403 também vem antes da validação do corpo', async () => {
      // Corpo inválido de propósito: um 400 aqui mostraria que o pipe roda
      // antes do guard, e o cliente sem permissão aprenderia o formato do DTO.
      const response = await request(app.getHttpServer())
        .post('/api/v1/users')
        .set('Authorization', bearer(operator))
        .send({ campo: 'invalido' });

      expect(response.status).toBe(403);
    });
  });

  describe('rotas públicas continuam públicas', () => {
    it.each(['/api/v1/health', '/api/v1/health/ready'])('%s responde sem token', async (path) => {
      const response = await request(app.getHttpServer()).get(path);

      expect(response.status).toBe(200);
    });
  });

  /**
   * Papel do TOKEN, não do banco.
   *
   * O access token carrega o papel assinado. Promover alguém no banco não
   * muda o token que ele já tem, e esta é a consequência documentada do
   * modelo sem lista de revogação (docs/15-plano-fase-4.md §15.5). O teste
   * existe para que o comportamento seja uma decisão registrada, e não uma
   * surpresa.
   */
  describe('papel vem do token enquanto ele durar', () => {
    it('promover no banco não dá acesso ao token antigo', async () => {
      const alvo = await createUser(prisma, UserRole.OPERATOR);
      const sessao = await createSession(app, prisma, UserRole.OPERATOR);

      await prisma.user.update({ where: { id: sessao.user.id }, data: { role: UserRole.ADMIN } });

      const response = await request(app.getHttpServer())
        .get('/api/v1/users')
        .set('Authorization', bearer(sessao));

      expect(response.status).toBe(403);
      expect(alvo.id).toBeTypeOf('string');
    });

    it('rebaixar no banco não retira o acesso do token antigo, por até 15 minutos', async () => {
      const sessao = await createSession(app, prisma, UserRole.ADMIN);

      await prisma.user.update({
        where: { id: sessao.user.id },
        data: { role: UserRole.OPERATOR },
      });

      const response = await request(app.getHttpServer())
        .get('/api/v1/users')
        .set('Authorization', bearer(sessao));

      // 200, e isso é a limitação aceita, não um defeito: o que a troca de
      // papel revoga é o refresh, então a janela máxima é a validade do
      // access.
      expect(response.status).toBe(200);
    });

    it('mas a renovação com o papel novo fecha a janela', async () => {
      const alvo = await createUser(prisma, UserRole.ADMIN);
      const sessao = await createSession(app, prisma, UserRole.ADMIN);

      // O login acontece ANTES de montar a requisição: o supertest abre um
      // listener por requisição, e aninhar uma chamada dentro do encadeamento
      // de outra derruba o endereço da externa.
      const ator = await login(app, alvo);

      // Ator distinto do alvo: trocar o próprio papel é recusado, e o caminho
      // que interessa aqui é o de um administrador rebaixando outra pessoa.
      await request(app.getHttpServer())
        .patch(`/api/v1/users/${sessao.user.id}/role`)
        .set('Authorization', bearer(ator))
        .send({ role: UserRole.OPERATOR })
        .expect(200);

      // O refresh foi revogado junto com a troca, então a sessão não renova.
      const renovacao = await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .set('Cookie', sessao.refreshCookie);

      expect(renovacao.status).toBe(401);
    });
  });
});

/**
 * Torna único o que o banco exige único.
 *
 * Três papéis executam o mesmo POST no mesmo caso de teste. Sem sufixo, o
 * segundo receberia 409 por e-mail ou nome repetido, e o caso falharia por um
 * motivo que não tem nada a ver com permissão.
 */
function comSufixo(body: Record<string, unknown>, role: UserRole): Record<string, unknown> {
  const marca = role.toLowerCase();

  return {
    ...body,
    ...(typeof body['name'] === 'string' ? { name: `${body['name']} ${marca}` } : {}),
    ...(typeof body['email'] === 'string'
      ? { email: String(body['email']).replace('@', `-${marca}@`) }
      : {}),
  };
}
