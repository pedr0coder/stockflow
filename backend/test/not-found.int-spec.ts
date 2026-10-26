import { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PrismaService } from '../src/prisma/prisma.service';
import { UserRole } from '../src/generated/prisma/enums';
import {
  bearer,
  createSession,
  createTestApp,
  truncateAll,
  type Session,
  type TestApp,
} from './helpers/app';

/**
 * Todo 404 de recurso tem a mesma forma, e ela não mudou quando os services
 * deixaram de lançar `NotFoundException` e passaram a lançar `DomainError`.
 *
 * O que se verifica é o contrato inteiro da resposta (status, `code`,
 * mensagem, caminho, campos presentes e ausência de `details`), em TODA rota
 * que resolve um recurso por id, e não só no `GET :id`. Uma rota que
 * esquecesse de passar pela busca e devolvesse 500 de chave estrangeira ou
 * 200 vazio apareceria aqui.
 */
describe('Recurso inexistente (integração)', () => {
  const ID_INEXISTENTE = '0199a000-0000-7000-8000-000000000000';

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
    // ADMIN alcança todas as rotas abaixo: o que está sob teste é o 404, e um
    // 403 de papel o esconderia.
    admin = await createSession(app, prisma, UserRole.ADMIN);
  });

  interface Rota {
    metodo: 'get' | 'patch';
    caminho: string;
    corpo?: Record<string, unknown>;
  }

  const RECURSOS: { nome: string; mensagem: string; rotas: Rota[] }[] = [
    {
      nome: 'categoria',
      mensagem: 'Categoria não encontrada.',
      rotas: [
        { metodo: 'get', caminho: `/api/v1/categories/${ID_INEXISTENTE}` },
        {
          metodo: 'patch',
          caminho: `/api/v1/categories/${ID_INEXISTENTE}`,
          corpo: { name: 'Nova' },
        },
        {
          metodo: 'patch',
          caminho: `/api/v1/categories/${ID_INEXISTENTE}/status`,
          corpo: { isActive: false },
        },
      ],
    },
    {
      nome: 'produto',
      mensagem: 'Produto não encontrado.',
      rotas: [
        { metodo: 'get', caminho: `/api/v1/products/${ID_INEXISTENTE}` },
        { metodo: 'patch', caminho: `/api/v1/products/${ID_INEXISTENTE}`, corpo: { name: 'Novo' } },
        {
          metodo: 'patch',
          caminho: `/api/v1/products/${ID_INEXISTENTE}/status`,
          corpo: { isActive: false },
        },
      ],
    },
    {
      nome: 'fornecedor',
      mensagem: 'Fornecedor não encontrado.',
      rotas: [
        { metodo: 'get', caminho: `/api/v1/suppliers/${ID_INEXISTENTE}` },
        { metodo: 'get', caminho: `/api/v1/suppliers/${ID_INEXISTENTE}/products` },
        {
          metodo: 'patch',
          caminho: `/api/v1/suppliers/${ID_INEXISTENTE}`,
          corpo: { name: 'Novo' },
        },
        {
          metodo: 'patch',
          caminho: `/api/v1/suppliers/${ID_INEXISTENTE}/status`,
          corpo: { isActive: false },
        },
      ],
    },
    {
      nome: 'usuário',
      mensagem: 'Usuário não encontrado.',
      rotas: [
        { metodo: 'get', caminho: `/api/v1/users/${ID_INEXISTENTE}` },
        { metodo: 'patch', caminho: `/api/v1/users/${ID_INEXISTENTE}`, corpo: { name: 'Novo' } },
        {
          metodo: 'patch',
          caminho: `/api/v1/users/${ID_INEXISTENTE}/role`,
          corpo: { role: UserRole.MANAGER },
        },
        {
          metodo: 'patch',
          caminho: `/api/v1/users/${ID_INEXISTENTE}/status`,
          corpo: { isActive: false },
        },
      ],
    },
  ];

  for (const recurso of RECURSOS) {
    describe(recurso.nome, () => {
      it.each(recurso.rotas)('$metodo $caminho responde 404 no contrato único', async (rota) => {
        const chamada = request(app.getHttpServer())
          [rota.metodo](rota.caminho)
          .set('Authorization', bearer(admin));

        const response = await (rota.corpo !== undefined ? chamada.send(rota.corpo) : chamada);

        expect(response.status).toBe(404);
        expect(response.body).toMatchObject({
          statusCode: 404,
          code: 'NOT_FOUND',
          message: recurso.mensagem,
          path: rota.caminho,
        });
        expect(response.body.requestId).toEqual(expect.any(String));
        expect(new Date(response.body.timestamp).toString()).not.toBe('Invalid Date');
        // Mesmo conjunto de chaves que a resposta tinha com NotFoundException:
        // sem `details`, que só existe quando o erro traz contexto.
        expect(Object.keys(response.body).sort()).toEqual(
          ['code', 'message', 'path', 'requestId', 'statusCode', 'timestamp'].sort(),
        );
      });

      it('não é 500 nem vaza o interior', async () => {
        const rota = recurso.rotas[0]!;

        const response = await request(app.getHttpServer())
          .get(rota.caminho)
          .set('Authorization', bearer(admin));

        expect(response.status).toBeLessThan(500);
        expect(JSON.stringify(response.body)).not.toMatch(/stack|node_modules|\.ts:|prisma|SELECT/);
      });
    });
  }

  it('o 404 de rota inexistente continua distinto do de recurso', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/nao-existe')
      .set('Authorization', bearer(admin));

    expect(response.status).toBe(404);
    expect(response.body.code).toBe('NOT_FOUND');
    expect(response.body.message).toBe('Recurso não encontrado.');
  });

  it('o 404 de recurso é o mesmo texto para quem consulta e para quem altera', async () => {
    const consulta = await request(app.getHttpServer())
      .get(`/api/v1/products/${ID_INEXISTENTE}`)
      .set('Authorization', bearer(admin));
    const alteracao = await request(app.getHttpServer())
      .patch(`/api/v1/products/${ID_INEXISTENTE}`)
      .set('Authorization', bearer(admin))
      .send({ name: 'Novo' });

    // Duas rotas, uma causa, uma resposta.
    expect(alteracao.body.message).toBe(consulta.body.message);
    expect(alteracao.body.code).toBe(consulta.body.code);
  });
});
