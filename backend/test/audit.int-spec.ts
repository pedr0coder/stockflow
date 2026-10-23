import { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AuditAction } from '../src/audit/audit.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { UserRole } from '../src/generated/prisma/enums';
import {
  TEST_PASSWORD,
  bearer,
  createCategory,
  createProduct,
  createSession,
  createSupplier,
  createTestApp,
  createUser,
  login,
  pageOf,
  truncateAll,
  type Session,
  type TestApp,
} from './helpers/app';

/**
 * Auditoria: o que aconteceu, quem fez, e o que NÃO pode estar ali.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ Por que estes casos valem mais do que parecem.                            │
 * │                                                                          │
 * │ O `AuditService.record()` engole a própria exceção de propósito: uma      │
 * │ falha ao gravar o log não deve derrubar uma operação já concluída, senão  │
 * │ o usuário teria a ação revertida por causa do registro dela.              │
 * │                                                                          │
 * │ O preço disso é que o log pode falhar EM SILÊNCIO, e o caminho de         │
 * │ sucesso continua verde. Foi exatamente o que aconteceu nesta fase: os     │
 * │ registros de produto não eram gravados, porque o snapshot levava um       │
 * │ `Decimal` que o Prisma recusa escrever em coluna `Json`. Nenhum teste de  │
 * │ produto notou — eles afirmavam a resposta HTTP, que estava correta.       │
 * │                                                                          │
 * │ É por isso que cada ação auditável tem aqui um caso afirmando que o       │
 * │ registro EXISTE. Sem isso, a auditoria é uma promessa não verificada.     │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
describe('Auditoria (integração)', () => {
  let harness: TestApp;
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let admin: Session;

  beforeAll(async () => {
    harness = await createTestApp();
    app = harness.app;
    prisma = harness.prisma;
  });

  afterAll(async () => {
    await harness.close();
  });

  beforeEach(async () => {
    await truncateAll(prisma);
    admin = await createSession(app, prisma, UserRole.ADMIN);
  });

  function comoAdmin(method: 'get' | 'post' | 'patch', path: string) {
    return request(app.getHttpServer())[method](path).set('Authorization', bearer(admin));
  }

  /** Último registro de uma ação, lido direto do banco. */
  async function ultimoRegistro(action: string) {
    return prisma.auditLog.findFirst({ where: { action }, orderBy: { createdAt: 'desc' } });
  }

  describe('cada ação auditável deixa registro', () => {
    it('criação de produto, que é o caso que já falhou em silêncio', async () => {
      const categoria = await createCategory(prisma);

      const criado = await comoAdmin('post', '/api/v1/products')
        .send({ sku: 'AUD-0001', name: 'Produto auditado', categoryId: categoria.id, unit: 'UN' })
        .expect(201);

      const registro = await ultimoRegistro(AuditAction.PRODUCT_CREATED);

      expect(registro).not.toBeNull();
      expect(registro).toMatchObject({
        entity: 'Product',
        entityId: criado.body.id,
        userId: admin.user.id,
      });
    });

    it('o snapshot do produto guarda o decimal como texto, na escala do contrato', async () => {
      const categoria = await createCategory(prisma);

      await comoAdmin('post', '/api/v1/products')
        .send({
          sku: 'AUD-0002',
          name: 'Produto',
          categoryId: categoria.id,
          unit: 'UN',
          minStock: '10.5',
        })
        .expect(201);

      const registro = await ultimoRegistro(AuditAction.PRODUCT_CREATED);
      const depois = registro?.after as Record<string, unknown>;

      // Um log com `10.5` ao lado de uma resposta com `"10.500"` obrigaria
      // quem investiga a decidir qual dos dois é o valor real.
      expect(depois['minStock']).toBe('10.500');
      expect(depois['currentStock']).toBe('0.000');
    });

    it('alteração de produto guarda antes e depois', async () => {
      const categoria = await createCategory(prisma);
      const produto = await createProduct(prisma, categoria.id, { name: 'Nome antigo' });

      await comoAdmin('patch', `/api/v1/products/${produto.id}`)
        .send({ name: 'Nome novo' })
        .expect(200);

      const registro = await ultimoRegistro(AuditAction.PRODUCT_UPDATED);
      const antes = registro?.before as Record<string, unknown>;
      const depois = registro?.after as Record<string, unknown>;

      expect(antes['name']).toBe('Nome antigo');
      expect(depois['name']).toBe('Nome novo');
    });

    it('inativação de produto', async () => {
      const categoria = await createCategory(prisma);
      const produto = await createProduct(prisma, categoria.id);

      await comoAdmin('patch', `/api/v1/products/${produto.id}/status`)
        .send({ isActive: false })
        .expect(200);

      const registro = await ultimoRegistro(AuditAction.PRODUCT_STATUS_CHANGED);

      expect(registro?.before).toEqual({ isActive: true });
      expect(registro?.after).toEqual({ isActive: false });
    });

    it('criação e alteração de categoria', async () => {
      const criada = await comoAdmin('post', '/api/v1/categories')
        .send({ name: 'Categoria auditada' })
        .expect(201);

      await comoAdmin('patch', `/api/v1/categories/${criada.body.id}`)
        .send({ name: 'Renomeada' })
        .expect(200);

      expect(await ultimoRegistro(AuditAction.CATEGORY_CREATED)).not.toBeNull();
      expect(await ultimoRegistro(AuditAction.CATEGORY_UPDATED)).not.toBeNull();
    });

    it('inativação de categoria', async () => {
      const categoria = await createCategory(prisma);

      await comoAdmin('patch', `/api/v1/categories/${categoria.id}/status`)
        .send({ isActive: false })
        .expect(200);

      expect(await ultimoRegistro(AuditAction.CATEGORY_STATUS_CHANGED)).not.toBeNull();
    });

    it('criação e alteração de fornecedor', async () => {
      const criado = await comoAdmin('post', '/api/v1/suppliers')
        .send({ name: 'Fornecedor auditado' })
        .expect(201);

      await comoAdmin('patch', `/api/v1/suppliers/${criado.body.id}`)
        .send({ name: 'Renomeado' })
        .expect(200);

      expect(await ultimoRegistro(AuditAction.SUPPLIER_CREATED)).not.toBeNull();
      expect(await ultimoRegistro(AuditAction.SUPPLIER_UPDATED)).not.toBeNull();
    });

    it('inativação de fornecedor', async () => {
      const fornecedor = await createSupplier(prisma);

      await comoAdmin('patch', `/api/v1/suppliers/${fornecedor.id}/status`)
        .send({ isActive: false })
        .expect(200);

      expect(await ultimoRegistro(AuditAction.SUPPLIER_STATUS_CHANGED)).not.toBeNull();
    });

    it('criação de usuário', async () => {
      await comoAdmin('post', '/api/v1/users')
        .send({
          name: 'Pessoa',
          email: 'auditada@empresa.local',
          password: 'senha-bem-grande-1',
          role: UserRole.OPERATOR,
        })
        .expect(201);

      expect(await ultimoRegistro(AuditAction.USER_CREATED)).not.toBeNull();
    });

    it('troca de papel registra os dois papéis', async () => {
      const alvo = await createUser(prisma, UserRole.OPERATOR);

      await comoAdmin('patch', `/api/v1/users/${alvo.id}/role`)
        .send({ role: UserRole.MANAGER })
        .expect(200);

      const registro = await ultimoRegistro(AuditAction.USER_ROLE_CHANGED);

      expect(registro?.before).toEqual({ role: UserRole.OPERATOR });
      expect(registro?.after).toEqual({ role: UserRole.MANAGER });
    });

    it('inativação de usuário', async () => {
      const alvo = await createUser(prisma, UserRole.OPERATOR);

      await comoAdmin('patch', `/api/v1/users/${alvo.id}/status`)
        .send({ isActive: false })
        .expect(200);

      expect(await ultimoRegistro(AuditAction.USER_STATUS_CHANGED)).not.toBeNull();
    });

    it('troca de senha registra o fato, e nada mais', async () => {
      const sessao = await createSession(app, prisma, UserRole.OPERATOR);

      await request(app.getHttpServer())
        .patch('/api/v1/users/me/password')
        .set('Authorization', bearer(sessao))
        .send({ currentPassword: TEST_PASSWORD, newPassword: 'senha-nova-bem-grande' })
        .expect(204);

      const registro = await ultimoRegistro(AuditAction.USER_PASSWORD_CHANGED);

      expect(registro).not.toBeNull();
      // Nem a senha antiga, nem a nova, nem hash: só o fato de ter acontecido.
      expect(registro?.before).toBeNull();
      expect(registro?.after).toBeNull();
    });
  });

  describe('eventos de autenticação', () => {
    it('login bem-sucedido', async () => {
      const usuario = await createUser(prisma, UserRole.OPERATOR);
      await login(app, usuario);

      const registro = await ultimoRegistro(AuditAction.LOGIN_SUCCESS);

      expect(registro?.userId).toBe(usuario.id);
      expect(registro?.actorEmail).toBe(usuario.email);
    });

    it('senha errada em conta existente identifica a conta visada', async () => {
      const usuario = await createUser(prisma, UserRole.OPERATOR);

      await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: usuario.email, password: 'senha-errada-mas-longa' })
        .expect(401);

      const registro = await ultimoRegistro(AuditAction.LOGIN_FAILED);

      expect(registro?.actorEmail).toBe(usuario.email);
      // A resposta HTTP não distingue conta inexistente de senha errada, para
      // não permitir descobrir quais e-mails existem. O LOG distingue, e é o
      // que permite ver que uma conta específica está sob ataque.
      expect(registro?.userId).toBe(usuario.id);
    });

    it('e-mail inexistente registra a tentativa sem usuário', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: 'nao-existe@empresa.local', password: 'senha-qualquer-longa' })
        .expect(401);

      const registro = await ultimoRegistro(AuditAction.LOGIN_FAILED);

      // Sem usuário a quem atribuir, o `actorEmail` é o único dado que permite
      // investigar uma sequência de tentativas.
      expect(registro?.userId).toBeNull();
      expect(registro?.actorEmail).toBe('nao-existe@empresa.local');
    });

    it('conta inativa registra o motivo', async () => {
      const usuario = await createUser(prisma, UserRole.OPERATOR, { isActive: false });

      await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: usuario.email, password: TEST_PASSWORD })
        .expect(401);

      const registro = await ultimoRegistro(AuditAction.LOGIN_FAILED);

      expect(registro?.after).toEqual({ reason: 'USER_INACTIVE' });
    });

    it('login falho nunca grava a senha tentada', async () => {
      const usuario = await createUser(prisma, UserRole.OPERATOR);
      const senhaTentada = 'senha-secreta-tentada';

      await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: usuario.email, password: senhaTentada })
        .expect(401);

      const todos = await prisma.auditLog.findMany();
      expect(JSON.stringify(todos)).not.toContain(senhaTentada);
    });

    it('logout', async () => {
      const sessao = await createSession(app, prisma, UserRole.OPERATOR);

      await request(app.getHttpServer())
        .post('/api/v1/auth/logout')
        .set('Cookie', sessao.refreshCookie)
        .expect(204);

      expect(await ultimoRegistro(AuditAction.LOGOUT)).not.toBeNull();
    });

    it('reuso de refresh é registrado como detecção', async () => {
      const usuario = await createUser(prisma, UserRole.OPERATOR);
      const sessao = await login(app, usuario);

      // Primeira rotação consome o token.
      await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .set('Cookie', sessao.refreshCookie)
        .expect(200);

      // Segunda apresentação do MESMO token: é o sinal de roubo.
      await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .set('Cookie', sessao.refreshCookie)
        .expect(401);

      const registro = await ultimoRegistro(AuditAction.REFRESH_REUSE_DETECTED);

      expect(registro).not.toBeNull();
      expect(registro?.userId).toBe(usuario.id);
    });
  });

  /**
   * O log NUNCA guarda credencial.
   *
   * A verificação é feita no JSON inteiro de todos os registros, e não campo a
   * campo: campo a campo deixa passar exatamente o campo que ninguém pensou em
   * conferir.
   */
  describe('ausência de dado sensível', () => {
    it('nenhum registro contém hash, senha ou token depois de um fluxo completo', async () => {
      const categoria = await createCategory(prisma);
      const senha = 'senha-usada-no-fluxo-1';

      await comoAdmin('post', '/api/v1/users')
        .send({
          name: 'Pessoa',
          email: 'fluxo@empresa.local',
          password: senha,
          role: UserRole.OPERATOR,
        })
        .expect(201);

      await comoAdmin('post', '/api/v1/products')
        .send({ sku: 'AUD-0003', name: 'Produto', categoryId: categoria.id, unit: 'UN' })
        .expect(201);

      const sessao = await login(
        app,
        { id: '', email: 'fluxo@empresa.local', role: UserRole.OPERATOR },
        senha,
      );

      await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .set('Cookie', sessao.refreshCookie)
        .expect(200);

      const serializado = JSON.stringify(await prisma.auditLog.findMany());

      expect(serializado).not.toContain('$argon2');
      expect(serializado).not.toContain('passwordHash');
      expect(serializado).not.toContain(senha);
      expect(serializado).not.toContain(sessao.accessToken);
      expect(serializado).not.toContain(sessao.refreshCookie.split('=')[1]);
    });

    it('o snapshot de criação de usuário redige o hash em vez de omiti-lo por sorte', async () => {
      await comoAdmin('post', '/api/v1/users')
        .send({
          name: 'Pessoa',
          email: 'redigida@empresa.local',
          password: 'senha-bem-grande-1',
          role: UserRole.OPERATOR,
        })
        .expect(201);

      const registro = await ultimoRegistro(AuditAction.USER_CREATED);
      const depois = registro?.after as Record<string, unknown>;

      // O e-mail está lá: o snapshot não é vazio, é redigido. Se o `after`
      // viesse vazio, o teste anterior passaria sem provar nada.
      expect(depois['email']).toBe('redigida@empresa.local');
      expect(depois['passwordHash']).toBeUndefined();
    });
  });

  describe('somente leitura, por desenho', () => {
    it.each([
      ['post', '/api/v1/audit'],
      ['patch', '/api/v1/audit'],
      ['delete', '/api/v1/audit'],
    ] as const)('%s %s não é rota', async (method, path) => {
      const response = await request(app.getHttpServer())
        [method](path)
        .set('Authorization', bearer(admin))
        .send({});

      // Um endpoint capaz de alterar o log anularia o propósito dele.
      expect(response.status).toBe(404);
    });

    it('não existe rota para apagar um registro específico', async () => {
      const categoria = await createCategory(prisma);
      await comoAdmin('patch', `/api/v1/categories/${categoria.id}/status`)
        .send({ isActive: false })
        .expect(200);

      const registro = await ultimoRegistro(AuditAction.CATEGORY_STATUS_CHANGED);

      const response = await request(app.getHttpServer())
        .delete(`/api/v1/audit/${String(registro?.id)}`)
        .set('Authorization', bearer(admin));

      expect(response.status).toBe(404);
    });
  });

  describe('consulta', () => {
    beforeEach(async () => {
      const categoria = await createCategory(prisma);

      for (let i = 1; i <= 5; i += 1) {
        await comoAdmin('post', '/api/v1/products')
          .send({
            sku: `AUD-${String(i).padStart(4, '0')}`,
            name: `Produto ${String(i)}`,
            categoryId: categoria.id,
            unit: 'UN',
          })
          .expect(201);
      }
    });

    it('lista do mais recente para o mais antigo por padrão', async () => {
      const response = await comoAdmin('get', '/api/v1/audit');

      expect(response.status).toBe(200);

      const datas = pageOf<{ createdAt: string }>(response).data.map((item) =>
        new Date(item.createdAt).getTime(),
      );
      const ordenado = [...datas].sort((a, b) => b - a);

      // Em log, o que interessa é o que acabou de acontecer, não o primeiro
      // registro do ano.
      expect(datas).toEqual(ordenado);
    });

    it('filtra por ação', async () => {
      const response = await comoAdmin(
        'get',
        `/api/v1/audit?action=${AuditAction.PRODUCT_CREATED}`,
      );

      expect(response.body.meta.total).toBe(5);
    });

    it('filtra por entidade', async () => {
      const response = await comoAdmin('get', '/api/v1/audit?entity=Product');

      expect(response.body.meta.total).toBe(5);
    });

    it('filtra pelo autor', async () => {
      const response = await comoAdmin('get', `/api/v1/audit?userId=${admin.user.id}`);

      expect(response.body.meta.total).toBeGreaterThanOrEqual(5);
    });

    it('pagina', async () => {
      const response = await comoAdmin('get', '/api/v1/audit?limit=2');

      expect(response.body.data).toHaveLength(2);
      expect(response.body.meta.hasNext).toBe(true);
    });

    it('recusa coluna de ordenação fora da allowlist', async () => {
      const response = await comoAdmin('get', '/api/v1/audit?sort=before');

      expect(response.status).toBe(400);
    });

    it('histórico de uma entidade traz só os registros dela', async () => {
      const categoria = await createCategory(prisma);
      const produto = await createProduct(prisma, categoria.id);

      await comoAdmin('patch', `/api/v1/products/${produto.id}`)
        .send({ name: 'Alterado' })
        .expect(200);

      const response = await comoAdmin('get', `/api/v1/audit/Product/${produto.id}`);

      expect(response.status).toBe(200);
      expect(response.body.meta.total).toBe(1);
      expect(response.body.data[0].entityId).toBe(produto.id);
    });

    it('histórico de entidade sem registro devolve lista vazia, não 404', async () => {
      const categoria = await createCategory(prisma);

      const response = await comoAdmin('get', `/api/v1/audit/Product/${categoria.id}`);

      expect(response.status).toBe(200);
      expect(response.body.data).toEqual([]);
    });

    it('recusa entityId que não é UUID', async () => {
      const response = await comoAdmin('get', '/api/v1/audit/Product/nao-e-uuid');

      expect(response.status).toBe(400);
    });
  });
});
