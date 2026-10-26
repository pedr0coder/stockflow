import { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildOpenApiDocument } from '../src/bootstrap';
import { createTestApp, type TestApp } from './helpers/app';

/**
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ A SUPERFÍCIE DE ROTAS, FIXADA CONTRA O CONTRATO.                         │
 * │                                                                          │
 * │ A Fase 4 fechou com 31 rotas (32 documentadas menos                      │
 * │ `GET /products/:id/movements`, adiada por decisão registrada em          │
 * │ docs/15-plano-fase-4.md §15.3). O marco 5A da Fase 5 soma as 6 rotas de  │
 * │ `/stock-movements` e a retomada de `/products/:id/movements             │
 * │ (docs/17-plano-fase-5.md §17.2):                                         │
 * │                                                                          │
 * │   31 da Fase 4 + 6 do marco 5A = 37                                      │
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

  // §5.6 Produtos
  'GET /api/v1/products',
  'POST /api/v1/products',
  'GET /api/v1/products/{id}',
  'PATCH /api/v1/products/{id}',
  'PATCH /api/v1/products/{id}/status',
  'GET /api/v1/products/{id}/movements',

  // §5.7 Movimentações de estoque (Fase 5, marco 5A)
  'GET /api/v1/stock-movements',
  'GET /api/v1/stock-movements/{id}',
  'POST /api/v1/stock-movements/in',
  'POST /api/v1/stock-movements/out',
  'POST /api/v1/stock-movements/adjustment',

  // §5.11 Auditoria
  'GET /api/v1/audit',
  'GET /api/v1/audit/{entity}/{entityId}',

  // §5.12 Infraestrutura
  'GET /api/v1/health',
  'GET /api/v1/health/ready',
];

/** Rotas do marco 5B. Nenhuma delas deve existir ainda. */
const ROTAS_DE_FASES_FUTURAS: readonly [string, string][] = [
  ['post', '/api/v1/inventories'],
  ['get', '/api/v1/inventories'],
  ['get', '/api/v1/dashboard/summary'],
  ['get', '/api/v1/reports/low-stock'],
  ['get', '/api/v1/reports/stock-reconciliation'],
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

  it('implementa exatamente 37 rotas (marco 5A)', () => {
    expect(rotas).toHaveLength(ROTAS_ESPERADAS.length);
    expect(ROTAS_ESPERADAS).toHaveLength(37);
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

  it('GET /products/:id/movements existe desde a Fase 5 (marco 5A)', () => {
    expect(rotas).toContain('GET /api/v1/products/{id}/movements');
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
