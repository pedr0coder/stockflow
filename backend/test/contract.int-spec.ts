import { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildOpenApiDocument } from '../src/bootstrap';
import { createTestApp, type TestApp } from './helpers/app';

/**
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ A SUPERFÍCIE DE ROTAS, FIXADA CONTRA O CONTRATO.                         │
 * │                                                                          │
 * │ A docs/05-api.md documenta 32 rotas nas seções desta fase (§5.2 a §5.6,  │
 * │ §5.11 e §5.12). Uma delas, `GET /products/:id/movements`, foi adiada     │
 * │ para a Fase 5 por decisão aprovada: ela devolve histórico de             │
 * │ movimentação, e o histórico não existe antes do módulo que o produz.     │
 * │                                                                          │
 * │   32 documentadas − 1 adiada = 31 implementadas                          │
 * │                                                                          │
 * │ A lista abaixo é essa conta, escrita por extenso. Um teste que só        │
 * │ contasse rotas passaria com a rota errada implementada; este compara     │
 * │ método e caminho, um por um, e falha nas duas direções: rota que falta   │
 * │ e rota que sobra.                                                        │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
const ROTAS_ESPERADAS: readonly string[] = [
  // §5.2 Autenticação
  'POST /api/v1/auth/login',
  'POST /api/v1/auth/refresh',
  'POST /api/v1/auth/logout',
  'GET /api/v1/auth/me',

  // §5.3 Usuários
  'GET /api/v1/users',
  'POST /api/v1/users',
  'GET /api/v1/users/{id}',
  'PATCH /api/v1/users/{id}',
  'PATCH /api/v1/users/{id}/role',
  'PATCH /api/v1/users/{id}/status',
  'PATCH /api/v1/users/me/password',

  // §5.4 Categorias
  'GET /api/v1/categories',
  'POST /api/v1/categories',
  'GET /api/v1/categories/{id}',
  'PATCH /api/v1/categories/{id}',
  'PATCH /api/v1/categories/{id}/status',

  // §5.5 Fornecedores
  'GET /api/v1/suppliers',
  'POST /api/v1/suppliers',
  'GET /api/v1/suppliers/{id}',
  'PATCH /api/v1/suppliers/{id}',
  'PATCH /api/v1/suppliers/{id}/status',
  'GET /api/v1/suppliers/{id}/products',

  // §5.6 Produtos (sem /products/{id}/movements, que é da Fase 5)
  'GET /api/v1/products',
  'POST /api/v1/products',
  'GET /api/v1/products/{id}',
  'PATCH /api/v1/products/{id}',
  'PATCH /api/v1/products/{id}/status',

  // §5.11 Auditoria
  'GET /api/v1/audit',
  'GET /api/v1/audit/{entity}/{entityId}',

  // §5.12 Infraestrutura
  'GET /api/v1/health',
  'GET /api/v1/health/ready',
];

/** Rotas de fases futuras. Nenhuma delas deve existir ainda. */
const ROTAS_DE_FASES_FUTURAS: readonly [string, string][] = [
  ['get', '/api/v1/stock-movements'],
  ['post', '/api/v1/stock-movements/in'],
  ['post', '/api/v1/stock-movements/out'],
  ['get', '/api/v1/inventories'],
  ['get', '/api/v1/dashboard/summary'],
  ['get', '/api/v1/reports/stock'],
];

describe('Contrato da API (integração)', () => {
  let harness: TestApp;
  let app: NestExpressApplication;
  let rotas: string[];

  beforeAll(async () => {
    harness = await createTestApp();
    app = harness.app;

    const documento = buildOpenApiDocument(app);

    rotas = Object.entries(documento.paths).flatMap(([caminho, operacoes]) =>
      Object.keys(operacoes as Record<string, unknown>)
        .filter((metodo) => ['get', 'post', 'patch', 'put', 'delete'].includes(metodo))
        .map((metodo) => `${metodo.toUpperCase()} ${caminho}`),
    );
  });

  afterAll(async () => {
    await harness.close();
  });

  it('implementa exatamente 31 rotas', () => {
    expect(rotas).toHaveLength(ROTAS_ESPERADAS.length);
    expect(ROTAS_ESPERADAS).toHaveLength(31);
  });

  it('não falta nenhuma rota do contrato', () => {
    const faltando = ROTAS_ESPERADAS.filter((rota) => !rotas.includes(rota));

    expect(faltando).toEqual([]);
  });

  it('não existe rota fora do contrato', () => {
    // A direção que costuma passar sem ninguém notar: alguém adiciona um
    // endpoint de conveniência que nunca foi documentado nem revisado.
    const sobrando = rotas.filter((rota) => !ROTAS_ESPERADAS.includes(rota));

    expect(sobrando).toEqual([]);
  });

  it('GET /products/:id/movements ainda NÃO existe, e isso é a decisão registrada', async () => {
    expect(rotas).not.toContain('GET /api/v1/products/{id}/movements');

    // Também não responde por acidente de roteamento: `:id/movements` poderia
    // cair em outro handler com parâmetro curinga.
    const response = await request(app.getHttpServer()).get(
      '/api/v1/products/0199a000-0000-7000-8000-000000000000/movements',
    );

    expect(response.status).toBe(404);
  });

  it.each(ROTAS_DE_FASES_FUTURAS)(
    '%s %s é de fase futura e não responde',
    async (metodo, caminho) => {
      const agente = request(app.getHttpServer());
      const response = await (metodo === 'get' ? agente.get(caminho) : agente.post(caminho)).send(
        {},
      );

      expect(response.status).toBe(404);
    },
  );

  describe('forma do documento OpenAPI', () => {
    it('declara o esquema de autenticação por bearer', () => {
      const documento = buildOpenApiDocument(app);

      expect(documento.components?.securitySchemes).toHaveProperty('access-token');
    });

    it('descreve os decimais como string, não como number', () => {
      const documento = buildOpenApiDocument(app);
      const produto = documento.components?.schemas?.['ProductDto'];
      const propriedades = (produto as { properties?: Record<string, { type?: string }> })
        .properties;

      // Um cliente que gere código a partir deste documento criaria `number` e
      // perderia precisão silenciosamente.
      expect(propriedades?.['currentStock']?.type).toBe('string');
      expect(propriedades?.['unitCost']?.type).toBe('string');
    });

    it('não expõe passwordHash em nenhum esquema', () => {
      const documento = buildOpenApiDocument(app);

      expect(JSON.stringify(documento.components?.schemas)).not.toContain('passwordHash');
    });
  });

  /**
   * Erro fora do roteador do Nest.
   *
   * Uma requisição a um caminho fora do prefixo nunca chega ao filtro de
   * exceção e cairia no handler padrão do Express, que responde HTML. A
   * promessa de "uma só forma de erro em toda a API" seria falsa justamente no
   * erro mais comum de quem integra: errar a URL.
   */
  describe('forma única do erro', () => {
    it('caminho fora do prefixo responde JSON, não HTML', async () => {
      const response = await request(app.getHttpServer()).get('/users');

      expect(response.status).toBe(404);
      expect(response.headers['content-type']).toContain('application/json');
      expect(response.body).toMatchObject({ statusCode: 404, code: 'NOT_FOUND' });
    });

    it('todo erro traz requestId, timestamp, path e code', async () => {
      const response = await request(app.getHttpServer()).get('/api/v1/nao-existe');

      expect(response.body).toHaveProperty('requestId');
      expect(response.body).toHaveProperty('timestamp');
      expect(response.body).toHaveProperty('code');
      // O `path` inclui o prefixo: sem ele, quem lê o log não sabe qual URL
      // foi chamada de fato.
      expect(response.body.path).toBe('/api/v1/nao-existe');
    });

    it('a mensagem de erro está em português, não no idioma do framework', async () => {
      const response = await request(app.getHttpServer()).get('/api/v1/nao-existe');

      expect(response.body.message).not.toContain('Cannot GET');
      expect(response.body.message).toBe('Recurso não encontrado.');
    });
  });
});
