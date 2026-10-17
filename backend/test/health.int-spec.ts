import { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { applyNotFoundHandler, configureApp, setupSwagger } from '../src/bootstrap';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * Teste de integração da fundação.
 *
 * Prova três coisas que um teste unitário não provaria:
 *
 *  1. a aplicação NestJS **sobe de verdade** sob o Vitest, com a injeção de
 *     dependência por decorator funcionando (é o teste que falharia se o
 *     `unplugin-swc` não estivesse configurado — ver docs/03-stack.md §3.5.1);
 *  2. o readiness consulta o PostgreSQL real e responde pelo resultado;
 *  3. o contrato único de erro vale para requisição HTTP de verdade, e não
 *     apenas na chamada direta do filtro.
 */
describe('Fundação (integração)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();

    app = moduleRef.createNestApplication<NestExpressApplication>();
    // Mesma configuração de produção, para que o teste exercite o que o
    // cliente real recebe.
    configureApp(app);
    setupSwagger(app);
    await app.init();
    // Depois do init, pelo mesmo motivo que em main.ts: é a ordem de registro
    // no Express que decide quem responde ao caminho não mapeado.
    applyNotFoundHandler(app);

    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await app?.close();
  });

  describe('ambiente de teste', () => {
    it('está apontando para o banco de teste, não para o de desenvolvimento', () => {
      // A trava está em test/setup-int.ts. Este caso documenta a garantia no
      // lugar onde alguém vai procurá-la.
      expect(process.env['DATABASE_URL']).toMatch(/test/i);
    });

    it('conecta no PostgreSQL real', async () => {
      const rows = await prisma.$queryRaw<{ um: number }[]>`SELECT 1 AS um`;

      expect(rows[0]?.um).toBe(1);
    });

    it('aplicou a migration: as tabelas do modelo existem', async () => {
      const rows = await prisma.$queryRaw<{ tablename: string }[]>`
        SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename
      `;
      const tables = rows.map((r) => r.tablename);

      expect(tables).toEqual(
        expect.arrayContaining([
          'audit_logs',
          'categories',
          'inventories',
          'inventory_items',
          'products',
          'refresh_tokens',
          'stock_movements',
          'suppliers',
          'users',
        ]),
      );
    });

    it('criou os CHECK constraints da migration escrita à mão', async () => {
      const rows = await prisma.$queryRaw<{ conname: string }[]>`
        SELECT conname FROM pg_constraint
         WHERE contype = 'c' AND connamespace = 'public'::regnamespace
         ORDER BY conname
      `;
      const names = rows.map((r) => r.conname);

      // São a última linha de defesa do saldo (ADR-0003). Se uma migration
      // futura as derrubar, este teste avisa antes da Fase 5 depender delas.
      expect(names).toEqual(
        expect.arrayContaining([
          'products_current_stock_non_negative',
          'products_min_stock_non_negative',
          'products_unit_cost_non_negative',
          'stock_movements_quantity_positive',
          'stock_movements_stock_after_non_negative',
        ]),
      );
    });

    it('criou o índice GIN trigram usado na busca por nome', async () => {
      const rows = await prisma.$queryRaw<{ indexdef: string }[]>`
        SELECT indexdef FROM pg_indexes WHERE indexname = 'products_name_trgm_idx'
      `;

      expect(rows[0]?.indexdef).toContain('gin');
      expect(rows[0]?.indexdef).toContain('gin_trgm_ops');
    });

    it('guarda quantidade como numeric(14,3), não como float', async () => {
      const rows = await prisma.$queryRaw<{ data_type: string; numeric_scale: number }[]>`
        SELECT data_type, numeric_scale FROM information_schema.columns
         WHERE table_name = 'products' AND column_name = 'current_stock'
      `;

      // Se alguém trocar por double precision, 0.1 + 0.2 deixa de dar 0.3 e o
      // saldo passa a acumular erro. Ver docs/10-riscos.md R8.
      expect(rows[0]?.data_type).toBe('numeric');
      expect(Number(rows[0]?.numeric_scale)).toBe(3);
    });
  });

  describe('GET /api/v1/health', () => {
    it('responde 200 com o corpo mínimo', async () => {
      const response = await request(app.getHttpServer()).get('/api/v1/health');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ status: 'ok' });
    });

    it('não revela versão, dependência nem detalhe interno', async () => {
      const response = await request(app.getHttpServer()).get('/api/v1/health');

      // Contrato da §5.12: o liveness é público e não é fonte de reconhecimento.
      expect(Object.keys(response.body)).toEqual(['status']);
      expect(response.headers['x-powered-by']).toBeUndefined();
    });

    it('envia os cabeçalhos de segurança do Helmet', async () => {
      const response = await request(app.getHttpServer()).get('/api/v1/health');

      expect(response.headers['x-content-type-options']).toBe('nosniff');
      expect(response.headers['content-security-policy']).toContain("frame-ancestors 'none'");
      expect(response.headers['content-security-policy']).toContain("object-src 'none'");
    });

    it('devolve um x-request-id em formato UUIDv7', async () => {
      const response = await request(app.getHttpServer()).get('/api/v1/health');

      expect(response.headers['x-request-id']).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
      );
    });

    it('respeita um x-request-id enviado pelo cliente, para rastrear a cadeia', async () => {
      const incoming = '01a148b9-2222-7000-8000-00000000abcd';
      const response = await request(app.getHttpServer())
        .get('/api/v1/health')
        .set('x-request-id', incoming);

      expect(response.headers['x-request-id']).toBe(incoming);
    });
  });

  describe('GET /api/v1/health/ready', () => {
    it('responde 200 com o banco acessível', async () => {
      const response = await request(app.getHttpServer()).get('/api/v1/health/ready');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ status: 'ok', database: 'up' });
    });
  });

  describe('contrato de erro', () => {
    it('rota inexistente devolve 404 no formato único, em português', async () => {
      const response = await request(app.getHttpServer()).get('/api/v1/rota-que-nao-existe');

      expect(response.status).toBe(404);
      expect(response.body).toMatchObject({
        statusCode: 404,
        code: 'NOT_FOUND',
        message: 'Recurso não encontrado.',
        path: '/api/v1/rota-que-nao-existe',
      });
      expect(response.body.requestId).toBeTypeOf('string');
      expect(response.body.timestamp).toBeTypeOf('string');
    });

    it('não vaza stack trace em nenhuma resposta de erro', async () => {
      const response = await request(app.getHttpServer()).get('/api/v1/rota-que-nao-existe');

      expect(response.body).not.toHaveProperty('stack');
      expect(JSON.stringify(response.body)).not.toContain('node_modules');
    });

    it('rota fora do prefixo também cai no contrato único, e não no HTML do Express', async () => {
      const response = await request(app.getHttpServer()).get('/health');

      expect(response.status).toBe(404);
      expect(response.headers['content-type']).toContain('application/json');
      expect(response.body.code).toBe('NOT_FOUND');
      expect(response.body.path).toBe('/health');
      expect(response.body.requestId).toBeTypeOf('string');
    });
  });

  describe('documentação OpenAPI', () => {
    it('serve o documento com os endpoints registrados', async () => {
      const response = await request(app.getHttpServer()).get('/api/docs-json');

      expect(response.status).toBe(200);
      expect(response.body.info.title).toBe('StockFlow API');
      expect(Object.keys(response.body.paths)).toEqual(
        expect.arrayContaining(['/api/v1/health', '/api/v1/health/ready']),
      );
    });

    it('descreve o schema das respostas, e não um corpo vazio', async () => {
      const response = await request(app.getHttpServer()).get('/api/docs-json');

      // É o que justifica usar class-validator no backend em vez de Zod puro:
      // o OpenAPI sai dos decorators dos DTOs (ADR-0002).
      expect(response.body.components.schemas).toHaveProperty('ReadinessResponseDto');
      expect(
        response.body.components.schemas.ReadinessResponseDto.properties.database.enum,
      ).toEqual(['up', 'down']);
    });
  });
});
