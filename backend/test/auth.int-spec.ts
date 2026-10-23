import { JwtService } from '@nestjs/jwt';
import { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PrismaService } from '../src/prisma/prisma.service';
import { TokenService } from '../src/auth/token.service';
import { UserRole } from '../src/generated/prisma/enums';
import {
  TEST_PASSWORD,
  createTestApp,
  createUser,
  extractRefreshCookie,
  login,
  truncateAll,
  type TestApp,
  type TestUser,
} from './helpers/app';

describe('Autenticação (integração)', () => {
  let harness: TestApp;
  let app: NestExpressApplication;
  let prisma: PrismaService;

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
  });

  describe('login', () => {
    it('autentica com credencial válida e devolve o access token', async () => {
      const user = await createUser(prisma, UserRole.OPERATOR);

      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: user.email, password: TEST_PASSWORD });

      expect(response.status).toBe(200);
      expect(response.body.accessToken).toBeTypeOf('string');
      expect(response.body.expiresIn).toBe(900);
      expect(response.body.user).toMatchObject({ email: user.email, role: UserRole.OPERATOR });
    });

    it('NÃO devolve passwordHash em lugar nenhum da resposta', async () => {
      const user = await createUser(prisma, UserRole.ADMIN);

      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: user.email, password: TEST_PASSWORD });

      expect(JSON.stringify(response.body)).not.toContain('passwordHash');
      expect(JSON.stringify(response.body)).not.toContain('$argon2');
    });

    it('NÃO devolve o refresh token no corpo', async () => {
      const user = await createUser(prisma, UserRole.OPERATOR);

      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: user.email, password: TEST_PASSWORD });

      // Devolvê-lo no corpo anularia a proteção do cookie httpOnly inteira.
      expect(JSON.stringify(response.body)).not.toContain('refreshToken');
    });

    it('grava o refresh em cookie httpOnly, SameSite=Strict e com path restrito', async () => {
      const user = await createUser(prisma, UserRole.OPERATOR);

      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: user.email, password: TEST_PASSWORD });

      const header = response.headers['set-cookie'];
      const cookie = (Array.isArray(header) ? header : [String(header)]).join(';');

      expect(cookie).toContain('HttpOnly');
      expect(cookie).toContain('SameSite=Strict');
      // O cookie não acompanha requisição de negócio: só chega às rotas de auth.
      expect(cookie).toContain('Path=/api/v1/auth');
    });

    it('persiste apenas o hash do refresh, nunca o token', async () => {
      const user = await createUser(prisma, UserRole.OPERATOR);
      const session = await login(app, user);
      const token = session.refreshCookie.split('=')[1] ?? '';

      const registros = await prisma.refreshToken.findMany({ where: { userId: user.id } });

      expect(registros).toHaveLength(1);
      expect(registros[0]?.tokenHash).toHaveLength(64);
      expect(registros[0]?.tokenHash).not.toBe(token);
    });

    it('atualiza lastLoginAt', async () => {
      const user = await createUser(prisma, UserRole.OPERATOR);
      await login(app, user);

      const atualizado = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });

      expect(atualizado.lastLoginAt).not.toBeNull();
    });

    it('recusa senha errada com INVALID_CREDENTIALS', async () => {
      const user = await createUser(prisma, UserRole.OPERATOR);

      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: user.email, password: 'senha-errada-mas-longa' });

      expect(response.status).toBe(401);
      expect(response.body.code).toBe('INVALID_CREDENTIALS');
    });

    it('responde IGUAL para e-mail inexistente e para senha errada', async () => {
      const user = await createUser(prisma, UserRole.OPERATOR);

      const senhaErrada = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: user.email, password: 'senha-errada-mas-longa' });

      const emailInexistente = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: 'nao-existe@teste.local', password: 'senha-errada-mas-longa' });

      // Respostas diferentes permitiriam descobrir quais e-mails existem no
      // sistema, testando um por um.
      expect(emailInexistente.status).toBe(senhaErrada.status);
      expect(emailInexistente.body.code).toBe(senhaErrada.body.code);
      expect(emailInexistente.body.message).toBe(senhaErrada.body.message);
    });

    it('recusa usuário inativo com USER_INACTIVE', async () => {
      const user = await createUser(prisma, UserRole.OPERATOR, { isActive: false });

      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: user.email, password: TEST_PASSWORD });

      expect(response.status).toBe(401);
      expect(response.body.code).toBe('USER_INACTIVE');
    });

    it('normaliza o e-mail: maiúsculas entram na mesma conta', async () => {
      const user = await createUser(prisma, UserRole.OPERATOR, {
        email: `caixa-${Date.now()}@teste.local`,
      });

      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: user.email.toUpperCase(), password: TEST_PASSWORD });

      expect(response.status).toBe(200);
    });

    it('recusa senha mais curta que a política', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: 'alguem@teste.local', password: 'curta' });

      expect(response.status).toBe(400);
      expect(JSON.stringify(response.body)).toContain('10 caracteres');
    });
  });

  describe('o access token', () => {
    it('não carrega e-mail nem nome', async () => {
      const user = await createUser(prisma, UserRole.MANAGER);
      const session = await login(app, user);

      const payload = JSON.parse(
        Buffer.from(session.accessToken.split('.')[1] ?? '', 'base64url').toString(),
      ) as Record<string, unknown>;

      // JWT é assinado, não criptografado: qualquer pessoa com o token lê o
      // conteúdo. Por isso ele carrega só identificador e papel (ADR-0005).
      expect(Object.keys(payload).sort()).toEqual(['exp', 'iat', 'jti', 'role', 'sub']);
      expect(JSON.stringify(payload)).not.toContain(user.email);
    });
  });

  describe('rota protegida', () => {
    it('recusa requisição sem token', async () => {
      const response = await request(app.getHttpServer()).get('/api/v1/products');

      expect(response.status).toBe(401);
    });

    it('recusa token assinado com o segredo do REFRESH', async () => {
      const user = await createUser(prisma, UserRole.ADMIN);
      const jwt = app.get(JwtService);

      const forjado = jwt.sign(
        { sub: user.id, role: user.role, jti: 'x' },
        { secret: process.env['JWT_REFRESH_SECRET'] ?? '', expiresIn: '15m' },
      );

      const response = await request(app.getHttpServer())
        .get('/api/v1/products')
        .set('Authorization', `Bearer ${forjado}`);

      // Prova que os dois segredos são de fato distintos e que um token de um
      // tipo não é aceito no lugar do outro.
      expect(response.status).toBe(401);
    });

    it('recusa token com payload adulterado', async () => {
      const user = await createUser(prisma, UserRole.OPERATOR);
      const session = await login(app, user);

      const [cabecalho, , assinatura] = session.accessToken.split('.');
      const adulterado = Buffer.from(
        JSON.stringify({ sub: user.id, role: 'ADMIN', jti: 'x' }),
      ).toString('base64url');

      const response = await request(app.getHttpServer())
        .get('/api/v1/users')
        .set('Authorization', `Bearer ${cabecalho}.${adulterado}.${assinatura}`);

      expect(response.status).toBe(401);
    });

    it('recusa token expirado', async () => {
      const user = await createUser(prisma, UserRole.ADMIN);
      const jwt = app.get(JwtService);

      const expirado = jwt.sign(
        { sub: user.id, role: user.role, jti: 'x' },
        { secret: process.env['JWT_SECRET'] ?? '', expiresIn: '-1s' },
      );

      const response = await request(app.getHttpServer())
        .get('/api/v1/products')
        .set('Authorization', `Bearer ${expirado}`);

      expect(response.status).toBe(401);
    });

    it('health continua público, sem token', async () => {
      // Com os guards globais negando por padrão, esquecer o @Public() aqui
      // faria o orquestrador receber 401 e tirar a aplicação do balanceador.
      expect((await request(app.getHttpServer()).get('/api/v1/health')).status).toBe(200);
      expect((await request(app.getHttpServer()).get('/api/v1/health/ready')).status).toBe(200);
    });
  });

  describe('refresh', () => {
    it('rotaciona e emite um par novo', async () => {
      const user = await createUser(prisma, UserRole.OPERATOR);
      const session = await login(app, user);

      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .set('Cookie', session.refreshCookie);

      expect(response.status).toBe(200);
      expect(response.body.accessToken).toBeTypeOf('string');
      expect(extractRefreshCookie(response.headers['set-cookie'])).not.toBe(session.refreshCookie);
    });

    it('invalida o refresh anterior ao rotacionar', async () => {
      const user = await createUser(prisma, UserRole.OPERATOR);
      const session = await login(app, user);

      await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .set('Cookie', session.refreshCookie);

      const antigo = await prisma.refreshToken.findFirst({ where: { userId: user.id } });
      expect(antigo?.revokedAt).not.toBeNull();
      expect(antigo?.replacedById).not.toBeNull();
    });

    it('reuso de refresh já rotacionado devolve REFRESH_TOKEN_REUSED', async () => {
      const user = await createUser(prisma, UserRole.OPERATOR);
      const session = await login(app, user);

      await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .set('Cookie', session.refreshCookie);

      const reuso = await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .set('Cookie', session.refreshCookie);

      expect(reuso.status).toBe(401);
      expect(reuso.body.code).toBe('REFRESH_TOKEN_REUSED');
    });

    it('o reuso revoga TODA a cadeia do usuário', async () => {
      const user = await createUser(prisma, UserRole.OPERATOR);
      const session = await login(app, user);

      const rotacionado = await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .set('Cookie', session.refreshCookie);

      const novoCookie = extractRefreshCookie(rotacionado.headers['set-cookie']);

      await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .set('Cookie', session.refreshCookie);

      // O token novo, que era legítimo, também cai: indício de roubo derruba
      // a sessão inteira (ADR-0005).
      const ativos = await prisma.refreshToken.count({
        where: { userId: user.id, revokedAt: null },
      });
      expect(ativos).toBe(0);

      const depois = await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .set('Cookie', novoCookie);
      expect(depois.status).toBe(401);
    });

    it('recusa refresh ausente', async () => {
      const response = await request(app.getHttpServer()).post('/api/v1/auth/refresh');

      expect(response.status).toBe(401);
    });

    it('usuário inativado não renova, mesmo com refresh válido', async () => {
      const user = await createUser(prisma, UserRole.OPERATOR);
      const session = await login(app, user);

      await prisma.user.update({ where: { id: user.id }, data: { isActive: false } });

      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .set('Cookie', session.refreshCookie);

      // É esta verificação que torna a inativação efetiva sem custar uma
      // consulta ao banco por requisição.
      expect(response.status).toBe(401);
    });
  });

  describe('rotação sob concorrência', () => {
    it('duas requisições simultâneas: exatamente uma vence', async () => {
      const user = await createUser(prisma, UserRole.OPERATOR);
      const session = await login(app, user);

      const resultados = await Promise.all([
        request(app.getHttpServer())
          .post('/api/v1/auth/refresh')
          .set('Cookie', session.refreshCookie),
        request(app.getHttpServer())
          .post('/api/v1/auth/refresh')
          .set('Cookie', session.refreshCookie),
      ]);

      // Sem o UPDATE condicional, as duas leriam "não revogado", as duas
      // passariam, e duas cadeias de sessão nasceriam do mesmo token.
      expect(resultados.filter((r) => r.status === 200)).toHaveLength(1);
      expect(resultados.filter((r) => r.status === 401)).toHaveLength(1);
    });

    it('cria exatamente um registro novo, e não dois', async () => {
      const user = await createUser(prisma, UserRole.OPERATOR);
      const session = await login(app, user);

      await Promise.all([
        request(app.getHttpServer())
          .post('/api/v1/auth/refresh')
          .set('Cookie', session.refreshCookie),
        request(app.getHttpServer())
          .post('/api/v1/auth/refresh')
          .set('Cookie', session.refreshCookie),
      ]);

      const total = await prisma.refreshToken.count({ where: { userId: user.id } });

      // O original mais um substituto. Um terceiro registro significaria que
      // duas rotações passaram.
      expect(total).toBe(2);
    });

    it('a perdedora é tratada como reuso e derruba a cadeia', async () => {
      const user = await createUser(prisma, UserRole.OPERATOR);
      const session = await login(app, user);

      const resultados = await Promise.all([
        request(app.getHttpServer())
          .post('/api/v1/auth/refresh')
          .set('Cookie', session.refreshCookie),
        request(app.getHttpServer())
          .post('/api/v1/auth/refresh')
          .set('Cookie', session.refreshCookie),
      ]);

      const perdedora = resultados.find((r) => r.status === 401);
      expect(perdedora?.body.code).toBe('REFRESH_TOKEN_REUSED');

      // Efeito colateral conhecido e aceito: duas abas renovando ao mesmo
      // tempo derrubam a sessão. Preferimos o falso positivo ao falso
      // negativo (docs/15-plano-fase-4.md §15.5).
      const ativos = await prisma.refreshToken.count({
        where: { userId: user.id, revokedAt: null },
      });
      expect(ativos).toBe(0);
    });

    it('com cinco requisições paralelas, o resultado é o mesmo', async () => {
      const user = await createUser(prisma, UserRole.OPERATOR);
      const session = await login(app, user);

      const resultados = await Promise.all(
        Array.from({ length: 5 }, () =>
          request(app.getHttpServer())
            .post('/api/v1/auth/refresh')
            .set('Cookie', session.refreshCookie),
        ),
      );

      expect(resultados.filter((r) => r.status === 200)).toHaveLength(1);
      expect(resultados.filter((r) => r.status === 401)).toHaveLength(4);
    });
  });

  describe('logout', () => {
    it('revoga o refresh e responde 204', async () => {
      const user = await createUser(prisma, UserRole.OPERATOR);
      const session = await login(app, user);

      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/logout')
        .set('Cookie', session.refreshCookie);

      expect(response.status).toBe(204);

      const ativos = await prisma.refreshToken.count({
        where: { userId: user.id, revokedAt: null },
      });
      expect(ativos).toBe(0);
    });

    it('o refresh deixa de funcionar depois do logout', async () => {
      const user = await createUser(prisma, UserRole.OPERATOR);
      const session = await login(app, user);

      await request(app.getHttpServer())
        .post('/api/v1/auth/logout')
        .set('Cookie', session.refreshCookie);

      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .set('Cookie', session.refreshCookie);

      expect(response.status).toBe(401);
    });

    it('apaga o cookie com os mesmos atributos com que foi criado', async () => {
      const user = await createUser(prisma, UserRole.OPERATOR);
      const session = await login(app, user);

      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/logout')
        .set('Cookie', session.refreshCookie);

      const header = response.headers['set-cookie'];
      const cookie = (Array.isArray(header) ? header : [String(header)]).join(';');

      // O navegador só remove um cookie quando path, sameSite e secure
      // coincidem com os do original.
      expect(cookie).toContain('Path=/api/v1/auth');
      expect(cookie).toContain('SameSite=Strict');
    });

    it('é idempotente: sem cookie também responde 204', async () => {
      const response = await request(app.getHttpServer()).post('/api/v1/auth/logout');

      expect(response.status).toBe(204);
    });
  });

  describe('revogar refresh não invalida o access já emitido', () => {
    it('documenta a janela de até 15 minutos', async () => {
      // ┌──────────────────────────────────────────────────────────────────┐
      // │ Documentação executável de uma limitação conhecida.              │
      // │                                                                  │
      // │ Revogar todos os refresh encerra a capacidade de RENOVAR. O      │
      // │ access já emitido continua válido até expirar, porque um JWT é   │
      // │ verificado pela assinatura e não existe estado no servidor para  │
      // │ apagar.                                                          │
      // │                                                                  │
      // │ Este teste afirma o comportamento real, e não o desejado.        │
      // └──────────────────────────────────────────────────────────────────┘
      const user = await createUser(prisma, UserRole.ADMIN);
      const session = await login(app, user);

      await app.get(TokenService).revokeAllForUser(user.id);

      const comAccess = await request(app.getHttpServer())
        .get('/api/v1/products')
        .set('Authorization', `Bearer ${session.accessToken}`);

      // O access continua funcionando: é a janela de 15 minutos.
      expect(comAccess.status).toBe(200);

      // Mas renovar já não é possível.
      const renovacao = await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .set('Cookie', session.refreshCookie);
      expect(renovacao.status).toBe(401);
    });
  });

  describe('/auth/me', () => {
    it('devolve o usuário do token', async () => {
      const user: TestUser = await createUser(prisma, UserRole.MANAGER);
      const session = await login(app, user);

      const response = await request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${session.accessToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({ id: user.id, email: user.email, role: user.role });
      expect(JSON.stringify(response.body)).not.toContain('passwordHash');
    });

    it('recusa sem token', async () => {
      expect((await request(app.getHttpServer()).get('/api/v1/auth/me')).status).toBe(401);
    });
  });
});
