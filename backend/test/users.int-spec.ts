import { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PrismaService } from '../src/prisma/prisma.service';
import { UserRole } from '../src/generated/prisma/enums';
import {
  TEST_PASSWORD,
  bearer,
  createSession,
  createTestApp,
  createUser,
  login,
  truncateAll,
  type Session,
  type TestApp,
} from './helpers/app';

/**
 * Cadastro de usuários: o recurso mais sensível da fase.
 *
 * É aqui que vivem senha, papel e situação da conta. Os casos abaixo cobrem
 * três coisas distintas, e a terceira é a que costuma faltar:
 *
 *   1. O CRUD faz o que diz.
 *   2. O que não deveria ser possível não é (mass assignment, trocar a senha
 *      de outra pessoa, rebaixar-se até ninguém poder promover).
 *   3. O que a API devolve não contém hash, senha nem token — verificado no
 *      JSON inteiro, não campo a campo, porque campo a campo deixa passar o
 *      campo que ninguém pensou em conferir.
 */
describe('Usuários (integração)', () => {
  let harness: TestApp;
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let admin: Session;

  const ID_INEXISTENTE = '0199a000-0000-7000-8000-000000000000';

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

  describe('criação', () => {
    it('cria usuário com papel explícito', async () => {
      const response = await comoAdmin('post', '/api/v1/users').send({
        name: 'Pessoa Nova',
        email: 'Pessoa.Nova@Empresa.Local',
        password: 'senha-bem-grande-1',
        role: UserRole.OPERATOR,
      });

      expect(response.status).toBe(201);
      expect(response.body).toMatchObject({
        name: 'Pessoa Nova',
        // Normalizado: sem isso, "Pessoa.Nova@" e "pessoa.nova@" seriam contas
        // diferentes para quem digita e a mesma para o índice único.
        email: 'pessoa.nova@empresa.local',
        role: UserRole.OPERATOR,
        isActive: true,
      });
    });

    it('a senha criada realmente autentica', async () => {
      const senha = 'senha-bem-grande-1';

      const criado = await comoAdmin('post', '/api/v1/users')
        .send({
          name: 'Pessoa',
          email: 'autentica@empresa.local',
          password: senha,
          role: UserRole.OPERATOR,
        })
        .expect(201);

      // Criar sem conseguir entrar seria um cadastro inútil, e o teste de
      // criação sozinho não perceberia.
      const sessao = await login(
        app,
        { id: criado.body.id, email: 'autentica@empresa.local', role: UserRole.OPERATOR },
        senha,
      );

      expect(sessao.accessToken).not.toBe('');
    });

    it('nunca devolve passwordHash na criação', async () => {
      const response = await comoAdmin('post', '/api/v1/users').send({
        name: 'Pessoa',
        email: 'sem-hash@empresa.local',
        password: 'senha-bem-grande-1',
        role: UserRole.OPERATOR,
      });

      const corpo = JSON.stringify(response.body);
      expect(corpo).not.toContain('passwordHash');
      expect(corpo).not.toContain('$argon2');
      expect(corpo).not.toContain('senha-bem-grande-1');
    });

    it('recusa senha abaixo da política', async () => {
      const response = await comoAdmin('post', '/api/v1/users').send({
        name: 'Pessoa',
        email: 'curta@empresa.local',
        password: 'curta',
        role: UserRole.OPERATOR,
      });

      expect(response.status).toBe(400);
      expect(response.body.details.fields).toHaveProperty('password');
    });

    it('recusa e-mail já cadastrado com 409', async () => {
      const existente = await createUser(prisma, UserRole.OPERATOR);

      const response = await comoAdmin('post', '/api/v1/users').send({
        name: 'Outra Pessoa',
        email: existente.email,
        password: 'senha-bem-grande-1',
        role: UserRole.OPERATOR,
      });

      expect(response.status).toBe(409);
      expect(response.body.code).toBe('EMAIL_ALREADY_EXISTS');
    });

    it('recusa papel fora do enum', async () => {
      const response = await comoAdmin('post', '/api/v1/users').send({
        name: 'Pessoa',
        email: 'papel@empresa.local',
        password: 'senha-bem-grande-1',
        role: 'SUPERADMIN',
      });

      expect(response.status).toBe(400);
    });

    /**
     * MASS ASSIGNMENT no recurso mais sensível.
     *
     * `isActive` e `id` não estão no DTO de criação. Se passassem, daria para
     * nascer uma conta inativa sem auditoria de inativação, ou com id
     * escolhido pelo cliente.
     */
    it('recusa isActive e id vindos do corpo na criação', async () => {
      for (const extra of [{ isActive: false }, { id: ID_INEXISTENTE }]) {
        const response = await comoAdmin('post', '/api/v1/users').send({
          name: 'Pessoa',
          email: `mass-${Object.keys(extra)[0] ?? 'x'}@empresa.local`,
          password: 'senha-bem-grande-1',
          role: UserRole.OPERATOR,
          ...extra,
        });

        expect(response.status).toBe(400);
      }
    });

    it('recusa passwordHash vindo do corpo', async () => {
      // Aceitar o hash direto permitiria plantar uma senha conhecida sem
      // passar pela política nem pelo Argon2.
      const response = await comoAdmin('post', '/api/v1/users').send({
        name: 'Pessoa',
        email: 'hash@empresa.local',
        password: 'senha-bem-grande-1',
        role: UserRole.OPERATOR,
        passwordHash: '$argon2id$v=19$m=19456,t=2,p=1$abc$def',
      });

      expect(response.status).toBe(400);
    });
  });

  describe('listagem e leitura', () => {
    it('nenhum item da listagem traz hash', async () => {
      await createUser(prisma, UserRole.OPERATOR);
      await createUser(prisma, UserRole.MANAGER);

      const response = await comoAdmin('get', '/api/v1/users');

      expect(response.status).toBe(200);
      expect(JSON.stringify(response.body)).not.toContain('$argon2');
      expect(JSON.stringify(response.body)).not.toContain('passwordHash');
    });

    it('busca por nome e por e-mail', async () => {
      await createUser(prisma, UserRole.OPERATOR, { email: 'procurado@empresa.local' });

      const response = await comoAdmin('get', '/api/v1/users?search=procurado');

      expect(response.body.meta.total).toBe(1);
    });

    it('filtra por papel', async () => {
      await createUser(prisma, UserRole.MANAGER);
      await createUser(prisma, UserRole.OPERATOR);

      const response = await comoAdmin('get', `/api/v1/users?role=${UserRole.MANAGER}`);

      expect(response.body.meta.total).toBe(1);
    });

    it('404 para usuário inexistente', async () => {
      const response = await comoAdmin('get', `/api/v1/users/${ID_INEXISTENTE}`);

      expect(response.status).toBe(404);
    });

    it('detalhe também não traz hash', async () => {
      const alvo = await createUser(prisma, UserRole.OPERATOR);

      const response = await comoAdmin('get', `/api/v1/users/${alvo.id}`);

      expect(JSON.stringify(response.body)).not.toContain('$argon2');
    });
  });

  describe('alteração de papel', () => {
    it('promove e encerra as sessões do alvo', async () => {
      const alvo = await createUser(prisma, UserRole.OPERATOR);
      const sessaoDoAlvo = await login(app, alvo);

      const response = await comoAdmin('patch', `/api/v1/users/${alvo.id}/role`).send({
        role: UserRole.MANAGER,
      });

      expect(response.status).toBe(200);
      expect(response.body.role).toBe(UserRole.MANAGER);

      // Atualizar o papel sem revogar deixaria a pessoa operando com o papel
      // antigo pelos sete dias de validade do refresh.
      const renovacao = await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .set('Cookie', sessaoDoAlvo.refreshCookie);

      expect(renovacao.status).toBe(401);
    });

    it('recusa o administrador alterar o próprio papel', async () => {
      const response = await comoAdmin('patch', `/api/v1/users/${admin.user.id}/role`).send({
        role: UserRole.OPERATOR,
      });

      // Um ADMIN que se rebaixa sozinho pode deixar o sistema sem nenhum
      // ADMIN, e sem ninguém capaz de promover outro.
      expect(response.status).toBe(422);
      expect(response.body.code).toBe('UNPROCESSABLE_ENTITY');
    });

    it('o papel no banco não muda quando a regra recusa', async () => {
      await comoAdmin('patch', `/api/v1/users/${admin.user.id}/role`)
        .send({ role: UserRole.OPERATOR })
        .expect(422);

      const depois = await prisma.user.findUnique({ where: { id: admin.user.id } });
      expect(depois?.role).toBe(UserRole.ADMIN);
    });

    it('aceita reenviar o mesmo papel do próprio usuário', async () => {
      // Não é alteração: a guarda existe contra rebaixamento, não contra um
      // PATCH idempotente que a tela pode emitir sem querer.
      const response = await comoAdmin('patch', `/api/v1/users/${admin.user.id}/role`).send({
        role: UserRole.ADMIN,
      });

      expect(response.status).toBe(200);
    });
  });

  describe('inativação', () => {
    it('inativa e encerra as sessões', async () => {
      const alvo = await createUser(prisma, UserRole.OPERATOR);
      const sessaoDoAlvo = await login(app, alvo);

      await comoAdmin('patch', `/api/v1/users/${alvo.id}/status`)
        .send({ isActive: false })
        .expect(200);

      const renovacao = await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .set('Cookie', sessaoDoAlvo.refreshCookie);

      expect(renovacao.status).toBe(401);
    });

    it('usuário inativo não consegue entrar', async () => {
      const alvo = await createUser(prisma, UserRole.OPERATOR);

      await comoAdmin('patch', `/api/v1/users/${alvo.id}/status`)
        .send({ isActive: false })
        .expect(200);

      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: alvo.email, password: TEST_PASSWORD });

      expect(response.status).toBe(401);
      // Mensagem distinta de credencial inválida de propósito: quem teve a
      // conta desativada precisa saber disso para procurar um administrador, e
      // a informação só chega a quem já provou conhecer a senha.
      expect(response.body.code).toBe('USER_INACTIVE');
    });

    it('recusa o administrador desativar a própria conta', async () => {
      const response = await comoAdmin('patch', `/api/v1/users/${admin.user.id}/status`).send({
        isActive: false,
      });

      expect(response.status).toBe(422);
    });

    it('reativa e o acesso volta', async () => {
      const alvo = await createUser(prisma, UserRole.OPERATOR, { isActive: false });

      await comoAdmin('patch', `/api/v1/users/${alvo.id}/status`)
        .send({ isActive: true })
        .expect(200);

      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: alvo.email, password: TEST_PASSWORD });

      expect(response.status).toBe(200);
    });

    it('não existe exclusão de usuário', async () => {
      const alvo = await createUser(prisma, UserRole.OPERATOR);

      const response = await request(app.getHttpServer())
        .delete(`/api/v1/users/${alvo.id}`)
        .set('Authorization', bearer(admin));

      // Apagar um usuário destruiria a autoria do histórico de movimentação.
      expect(response.status).toBe(404);
    });
  });

  /**
   * TROCA DE SENHA: o id vem do token, nunca da URL nem do corpo.
   *
   * A rota é `/users/me/password` e não `/users/:id/password`, e isso é a
   * defesa: não existe caminho para trocar a senha de outra pessoa, nem para o
   * ADMIN. Um `:id` aqui seria a superfície óbvia de escalonamento.
   */
  describe('troca da própria senha', () => {
    it('troca a senha e a nova passa a valer', async () => {
      const sessao = await createSession(app, prisma, UserRole.OPERATOR);
      const nova = 'senha-nova-bem-grande';

      const response = await request(app.getHttpServer())
        .patch('/api/v1/users/me/password')
        .set('Authorization', bearer(sessao))
        .send({ currentPassword: TEST_PASSWORD, newPassword: nova });

      expect(response.status).toBe(204);

      const comNova = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: sessao.user.email, password: nova });

      expect(comNova.status).toBe(200);
    });

    it('a senha antiga deixa de valer', async () => {
      const sessao = await createSession(app, prisma, UserRole.OPERATOR);

      await request(app.getHttpServer())
        .patch('/api/v1/users/me/password')
        .set('Authorization', bearer(sessao))
        .send({ currentPassword: TEST_PASSWORD, newPassword: 'senha-nova-bem-grande' })
        .expect(204);

      const comAntiga = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: sessao.user.email, password: TEST_PASSWORD });

      expect(comAntiga.status).toBe(401);
    });

    it('exige a senha atual', async () => {
      const sessao = await createSession(app, prisma, UserRole.OPERATOR);

      const response = await request(app.getHttpServer())
        .patch('/api/v1/users/me/password')
        .set('Authorization', bearer(sessao))
        .send({ currentPassword: 'errada-mas-longa', newPassword: 'senha-nova-bem-grande' });

      // Sem exigir a atual, um access token roubado permitiria tomar a conta
      // de forma permanente.
      expect(response.status).toBe(401);
      expect(response.body.code).toBe('INVALID_CREDENTIALS');
    });

    it('recusa senha nova abaixo da política', async () => {
      const sessao = await createSession(app, prisma, UserRole.OPERATOR);

      const response = await request(app.getHttpServer())
        .patch('/api/v1/users/me/password')
        .set('Authorization', bearer(sessao))
        .send({ currentPassword: TEST_PASSWORD, newPassword: 'curta' });

      expect(response.status).toBe(400);
    });

    it('encerra as outras sessões', async () => {
      const usuario = await createUser(prisma, UserRole.OPERATOR);
      const primeira = await login(app, usuario);
      const segunda = await login(app, usuario);

      await request(app.getHttpServer())
        .patch('/api/v1/users/me/password')
        .set('Authorization', bearer(segunda))
        .send({ currentPassword: TEST_PASSWORD, newPassword: 'senha-nova-bem-grande' })
        .expect(204);

      // Se a troca foi motivada por suspeita de acesso indevido, manter as
      // sessões antigas ativas anularia o efeito.
      const renovacao = await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .set('Cookie', primeira.refreshCookie);

      expect(renovacao.status).toBe(401);
    });

    it('não existe rota para trocar a senha de outra pessoa', async () => {
      const alvo = await createUser(prisma, UserRole.OPERATOR);

      const response = await comoAdmin('patch', `/api/v1/users/${alvo.id}/password`).send({
        newPassword: 'senha-nova-bem-grande',
      });

      expect(response.status).toBe(404);
    });

    it('o ADMIN não altera a senha de outra pessoa pelo PATCH genérico', async () => {
      const alvo = await createUser(prisma, UserRole.OPERATOR);

      const response = await comoAdmin('patch', `/api/v1/users/${alvo.id}`).send({
        password: 'senha-plantada-aqui',
      });

      expect(response.status).toBe(400);

      // E a senha original continua valendo.
      const aindaEntra = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: alvo.email, password: TEST_PASSWORD });

      expect(aindaEntra.status).toBe(200);
    });
  });
});
