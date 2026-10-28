import { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildOpenApiDocument } from '../src/bootstrap';
import { createTestApp, type TestApp } from './helpers/app';

/**
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ A SUPERFÍCIE DE ROTAS, FIXADA CONTRA O CONTRATO.                         │
 * │                                                                          │
 * │ A Fase 4 fechou com 31 rotas. O marco 5A somou as 6 rotas de             │
 * │ `/stock-movements` e a retomada de `GET /products/:id/movements`:        │
 * │ 31 + 6 = 37. O marco 5B soma as 16 rotas de `/inventories` (7),          │
 * │ `/dashboard` (3) e `/reports` (6): 37 + 16 = 53                          │
 * │ (docs/17-plano-fase-5.md §17.2, §17.4).                                  │
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

  // §5.8 Inventários (Fase 5, marco 5B)
  'GET /api/v1/inventories',
  'GET /api/v1/inventories/{id}',
  'POST /api/v1/inventories',
  'PATCH /api/v1/inventories/{id}/items/{itemId}/count',
  'POST /api/v1/inventories/{id}/submit',
  'POST /api/v1/inventories/{id}/approve',
  'POST /api/v1/inventories/{id}/cancel',

  // §5.9 Dashboard (Fase 5, marco 5B)
  'GET /api/v1/dashboard/summary',
  'GET /api/v1/dashboard/movements-chart',
  'GET /api/v1/dashboard/recent-movements',

  // §5.10 Relatórios (Fase 5, marco 5B)
  'GET /api/v1/reports/low-stock',
  'GET /api/v1/reports/out-of-stock',
  'GET /api/v1/reports/movements',
  'GET /api/v1/reports/inventories',
  'GET /api/v1/reports/divergences',
  'GET /api/v1/reports/stock-reconciliation',

  // §5.11 Auditoria
  'GET /api/v1/audit',
  'GET /api/v1/audit/{entity}/{entityId}',

  // §5.12 Infraestrutura
  'GET /api/v1/health',
  'GET /api/v1/health/ready',
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

  it('implementa exatamente 53 rotas (marco 5B)', () => {
    expect(rotas).toHaveLength(ROTAS_ESPERADAS.length);
    expect(ROTAS_ESPERADAS).toHaveLength(53);
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

  it('as 16 rotas do marco 5B existem (inventários, dashboard, relatórios)', () => {
    expect(rotas).toContain('POST /api/v1/inventories');
    expect(rotas).toContain('POST /api/v1/inventories/{id}/approve');
    expect(rotas).toContain('GET /api/v1/dashboard/summary');
    expect(rotas).toContain('GET /api/v1/reports/stock-reconciliation');
  });

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
