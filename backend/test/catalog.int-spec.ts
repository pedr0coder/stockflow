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
  pageOf,
  truncateAll,
  type Session,
  type TestApp,
} from './helpers/app';

/**
 * CRUD de categorias, fornecedores e produtos contra PostgreSQL real.
 *
 * O que estes casos protegem não é "o CRUD funciona": é o contrato. Formato do
 * decimal, recusa de campo não declarado, teto de paginação, allowlist de
 * ordenação, inativação em vez de exclusão, e o que a API devolve quando o
 * cliente erra. É a parte que um teste com banco mockado não alcança, porque
 * metade das regras vive em índice único, chave estrangeira e subconsulta.
 */
describe('Catálogo (integração)', () => {
  let harness: TestApp;
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let gerente: Session;

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
    gerente = await createSession(app, prisma, UserRole.MANAGER);
  });

  function comoGerente(method: 'get' | 'post' | 'patch', path: string) {
    return request(app.getHttpServer())[method](path).set('Authorization', bearer(gerente));
  }

  // ─────────────────────────────────────────────────────────────── categorias

  describe('categorias', () => {
    it('cria e devolve o recurso criado', async () => {
      const response = await comoGerente('post', '/api/v1/categories').send({
        name: 'Ferramentas',
        description: 'Chaves e alicates.',
      });

      expect(response.status).toBe(201);
      expect(response.body).toMatchObject({
        name: 'Ferramentas',
        description: 'Chaves e alicates.',
        isActive: true,
      });
      expect(response.body.id).toBeTypeOf('string');
    });

    it('remove espaço nas pontas do nome', async () => {
      const response = await comoGerente('post', '/api/v1/categories').send({
        name: '  Elétrica  ',
      });

      // Sem o trim, "Elétrica" e " Elétrica" seriam categorias diferentes para
      // o índice único, e duplicadas para quem olha a lista.
      expect(response.body.name).toBe('Elétrica');
    });

    it('recusa nome duplicado com 409', async () => {
      await createCategory(prisma, { name: 'Fixadores' });

      const response = await comoGerente('post', '/api/v1/categories').send({
        name: 'Fixadores',
      });

      expect(response.status).toBe(409);
      expect(response.body.code).toBe('CONFLICT');
    });

    /**
     * O erro é indexado pelo NOME do campo, não uma lista de frases.
     *
     * Sem o nome, o formulário da Fase 6 não tem como pintar o erro no input
     * certo, e sobraria casar a mensagem por texto — que quebra na primeira
     * vez que alguém reescrever a frase.
     */
    it('recusa nome curto com 400, indexado pelo nome do campo', async () => {
      const response = await comoGerente('post', '/api/v1/categories').send({ name: 'a' });

      expect(response.status).toBe(400);
      expect(response.body.code).toBe('VALIDATION_ERROR');
      expect(response.body.details.fields).toHaveProperty('name');
      expect(response.body.details.fields.name[0]).toContain('mínimo 2');
    });

    it('reporta todos os campos inválidos de uma vez', async () => {
      const response = await comoGerente('post', '/api/v1/categories').send({
        name: 'a',
        description: 'x'.repeat(501),
      });

      // Devolver um campo por requisição faria o formulário revelar os
      // problemas um a um, a cada envio.
      expect(Object.keys(response.body.details.fields).sort()).toEqual(['description', 'name']);
    });

    it('recusa campo não declarado no DTO', async () => {
      // `forbidNonWhitelisted`: um campo desconhecido é erro, não é ignorado
      // em silêncio. Ignorar faria o cliente acreditar que enviou algo.
      const response = await comoGerente('post', '/api/v1/categories').send({
        name: 'Limpeza',
        isActive: false,
      });

      expect(response.status).toBe(400);
    });

    it('atualiza o nome', async () => {
      const categoria = await createCategory(prisma, { name: 'Antigo' });

      const response = await comoGerente('patch', `/api/v1/categories/${categoria.id}`).send({
        name: 'Novo',
      });

      expect(response.status).toBe(200);
      expect(response.body.name).toBe('Novo');
    });

    it('404 para categoria inexistente', async () => {
      const response = await comoGerente('get', `/api/v1/categories/${ID_INEXISTENTE}`);

      expect(response.status).toBe(404);
      expect(response.body.code).toBe('NOT_FOUND');
    });

    it('400 para id que não é UUID v7', async () => {
      const response = await comoGerente('get', '/api/v1/categories/nao-e-uuid');

      expect(response.status).toBe(400);
    });

    it('inativa quando não há produto ativo', async () => {
      const categoria = await createCategory(prisma);

      const response = await comoGerente('patch', `/api/v1/categories/${categoria.id}/status`).send(
        { isActive: false },
      );

      expect(response.status).toBe(200);
      expect(response.body.isActive).toBe(false);
    });

    /**
     * A regra que a Fase 4 mais arrisca quebrar.
     *
     * A verificação de produto ativo vive DENTRO do UPDATE, como subconsulta.
     * Se alguém a trouxer para fora, este caso continua passando — mas o caso
     * de concorrência logo abaixo não.
     */
    it('recusa inativar categoria com produto ativo', async () => {
      const categoria = await createCategory(prisma);
      await createProduct(prisma, categoria.id);

      const response = await comoGerente('patch', `/api/v1/categories/${categoria.id}/status`).send(
        { isActive: false },
      );

      expect(response.status).toBe(409);
      expect(response.body.code).toBe('CATEGORY_HAS_PRODUCTS');
    });

    it('permite inativar depois que o produto é inativado', async () => {
      const categoria = await createCategory(prisma);
      await createProduct(prisma, categoria.id, { isActive: false });

      const response = await comoGerente('patch', `/api/v1/categories/${categoria.id}/status`).send(
        { isActive: false },
      );

      expect(response.status).toBe(200);
    });

    it('duas inativações simultâneas não deixam a categoria inconsistente', async () => {
      const categoria = await createCategory(prisma);

      const [a, b] = await Promise.all([
        comoGerente('patch', `/api/v1/categories/${categoria.id}/status`).send({
          isActive: false,
        }),
        comoGerente('patch', `/api/v1/categories/${categoria.id}/status`).send({
          isActive: false,
        }),
      ]);

      // Idempotente: as duas podem vencer, e o resultado é o mesmo.
      expect([a.status, b.status].every((status) => status === 200)).toBe(true);

      const final = await prisma.category.findUnique({ where: { id: categoria.id } });
      expect(final?.isActive).toBe(false);
    });

    it('não existe exclusão: DELETE não é rota', async () => {
      const categoria = await createCategory(prisma);

      const response = await request(app.getHttpServer())
        .delete(`/api/v1/categories/${categoria.id}`)
        .set('Authorization', bearer(gerente));

      expect(response.status).toBe(404);
    });
  });

  // ───────────────────────────────────────────────────────────── fornecedores

  describe('fornecedores', () => {
    it('cria com documento e contato', async () => {
      const response = await comoGerente('post', '/api/v1/suppliers').send({
        name: 'Distribuidora Exemplo',
        taxId: '11.111.111/0001-11',
        email: 'Contato@Exemplo.Invalid',
        phone: '(15) 3200-0001',
      });

      expect(response.status).toBe(201);
      // E-mail normalizado para minúsculas, como o banco o armazena.
      expect(response.body.email).toBe('contato@exemplo.invalid');
    });

    it('recusa documento fora do formato', async () => {
      const response = await comoGerente('post', '/api/v1/suppliers').send({
        name: 'Fornecedor',
        taxId: '11111111000111',
      });

      expect(response.status).toBe(400);
      expect(response.body.details.fields).toHaveProperty('taxId');
    });

    it('aceita CPF além de CNPJ', async () => {
      const response = await comoGerente('post', '/api/v1/suppliers').send({
        name: 'Prestador Individual',
        taxId: '123.456.789-09',
      });

      expect(response.status).toBe(201);
    });

    it('recusa e-mail inválido', async () => {
      const response = await comoGerente('post', '/api/v1/suppliers').send({
        name: 'Fornecedor',
        email: 'nao-e-email',
      });

      expect(response.status).toBe(400);
    });

    it('recusa documento duplicado com 409', async () => {
      await comoGerente('post', '/api/v1/suppliers')
        .send({ name: 'Primeiro', taxId: '22.222.222/0001-22' })
        .expect(201);

      const response = await comoGerente('post', '/api/v1/suppliers').send({
        name: 'Segundo',
        taxId: '22.222.222/0001-22',
      });

      expect(response.status).toBe(409);
    });

    it('lista os produtos do fornecedor, e só os dele', async () => {
      const categoria = await createCategory(prisma);
      const fornecedor = await createSupplier(prisma);
      const outro = await createSupplier(prisma);

      await createProduct(prisma, categoria.id, { supplierId: fornecedor.id });
      await createProduct(prisma, categoria.id, { supplierId: fornecedor.id });
      await createProduct(prisma, categoria.id, { supplierId: outro.id });

      const response = await comoGerente('get', `/api/v1/suppliers/${fornecedor.id}/products`);

      expect(response.status).toBe(200);
      expect(response.body.meta.total).toBe(2);
    });

    it('404 ao listar produtos de fornecedor inexistente', async () => {
      const response = await comoGerente('get', `/api/v1/suppliers/${ID_INEXISTENTE}/products`);

      expect(response.status).toBe(404);
    });
  });

  // ────────────────────────────────────────────────────────────────── produtos

  describe('produtos', () => {
    it('cria com saldo zero, sem aceitar saldo inicial', async () => {
      const categoria = await createCategory(prisma);

      const response = await comoGerente('post', '/api/v1/products').send({
        sku: 'fer-0001',
        name: 'Chave de fenda',
        categoryId: categoria.id,
        unit: 'UN',
        minStock: '10.000',
        unitCost: '12.9000',
      });

      expect(response.status).toBe(201);
      // SKU normalizado para maiúsculas, para que "fer-0001" colida com
      // "FER-0001" no índice único.
      expect(response.body.sku).toBe('FER-0001');
      expect(response.body.currentStock).toBe('0.000');
    });

    /**
     * MASS ASSIGNMENT: o cliente não escreve o saldo.
     *
     * `currentStock` não está no DTO porque saldo só muda por movimentação. Se
     * o campo passasse, existiria estoque que o histórico não explica, e o
     * relatório de movimentação deixaria de fechar com o saldo.
     */
    it('recusa currentStock na criação', async () => {
      const categoria = await createCategory(prisma);

      const response = await comoGerente('post', '/api/v1/products').send({
        sku: 'FER-0002',
        name: 'Alicate',
        categoryId: categoria.id,
        unit: 'UN',
        currentStock: '999.000',
      });

      expect(response.status).toBe(400);
      expect(JSON.stringify(response.body)).toContain('currentStock');
    });

    it('recusa currentStock na atualização', async () => {
      const categoria = await createCategory(prisma);
      const produto = await createProduct(prisma, categoria.id);

      const response = await comoGerente('patch', `/api/v1/products/${produto.id}`).send({
        currentStock: '500.000',
      });

      expect(response.status).toBe(400);

      // E o saldo no banco continua intacto, que é o que de fato importa.
      const depois = await prisma.product.findUnique({ where: { id: produto.id } });
      expect(depois?.currentStock.toFixed(3)).toBe('0.000');
    });

    it('recusa id, createdAt e isActive vindos do corpo', async () => {
      const categoria = await createCategory(prisma);
      const produto = await createProduct(prisma, categoria.id);

      for (const corpo of [
        { id: ID_INEXISTENTE },
        { createdAt: '2020-01-01T00:00:00.000Z' },
        { isActive: false },
      ]) {
        const response = await comoGerente('patch', `/api/v1/products/${produto.id}`).send(corpo);

        expect(response.status).toBe(400);
      }

      // `isActive` tem rota própria, com papel próprio. Deixá-lo passar no
      // PATCH genérico daria um segundo caminho para a mesma mudança, sem a
      // auditoria correspondente.
      const depois = await prisma.product.findUnique({ where: { id: produto.id } });
      expect(depois?.isActive).toBe(true);
    });

    it('recusa quantidade com mais de três casas', async () => {
      const categoria = await createCategory(prisma);

      const response = await comoGerente('post', '/api/v1/products').send({
        sku: 'FER-0003',
        name: 'Produto',
        categoryId: categoria.id,
        unit: 'UN',
        minStock: '10.0001',
      });

      // Aceitar a quarta casa faria o banco arredondar em silêncio, e o valor
      // exibido divergiria do enviado sem nenhum erro.
      expect(response.status).toBe(400);
    });

    it('recusa quantidade negativa', async () => {
      const categoria = await createCategory(prisma);

      const response = await comoGerente('post', '/api/v1/products').send({
        sku: 'FER-0004',
        name: 'Produto',
        categoryId: categoria.id,
        unit: 'UN',
        minStock: '-5.000',
      });

      expect(response.status).toBe(400);
    });

    it('recusa unidade de medida fora do enum', async () => {
      const categoria = await createCategory(prisma);

      const response = await comoGerente('post', '/api/v1/products').send({
        sku: 'FER-0005',
        name: 'Produto',
        categoryId: categoria.id,
        unit: 'TONELADA',
      });

      expect(response.status).toBe(400);
    });

    it('422 quando a categoria informada não existe', async () => {
      const response = await comoGerente('post', '/api/v1/products').send({
        sku: 'FER-0006',
        name: 'Produto',
        categoryId: ID_INEXISTENTE,
        unit: 'UN',
      });

      // 422 e não 404: a requisição estava bem formada, e quem a recusou foi a
      // regra. O 404 é para o recurso da URL, que aqui não existe.
      expect(response.status).toBe(422);
    });

    it('recusa SKU duplicado com 409', async () => {
      const categoria = await createCategory(prisma);
      await createProduct(prisma, categoria.id, { sku: 'FER-9999' });

      const response = await comoGerente('post', '/api/v1/products').send({
        sku: 'FER-9999',
        name: 'Outro',
        categoryId: categoria.id,
        unit: 'UN',
      });

      expect(response.status).toBe(409);
      expect(response.body.code).toBe('SKU_ALREADY_EXISTS');
    });

    it('inativa sem apagar: o registro continua no banco', async () => {
      const categoria = await createCategory(prisma);
      const produto = await createProduct(prisma, categoria.id);

      await comoGerente('patch', `/api/v1/products/${produto.id}/status`)
        .send({ isActive: false })
        .expect(200);

      const depois = await prisma.product.findUnique({ where: { id: produto.id } });
      expect(depois).not.toBeNull();
      expect(depois?.isActive).toBe(false);
    });
  });

  // ──────────────────────────────────────────────────── contrato do decimal

  /**
   * ESCALA FIXA, sempre.
   *
   * Quantidade sai com três casas e dinheiro com quatro, porque é o que as
   * colunas declaram. Um cliente que corte a casa decimal por posição, ou que
   * compare strings, lê errado se o zero vier como `"0"`.
   */
  describe('formato dos decimais na resposta', () => {
    it('quantidade com três casas e custo com quatro', async () => {
      const categoria = await createCategory(prisma);
      const produto = await createProduct(prisma, categoria.id, {
        currentStock: '19.5',
        minStock: '0',
        unitCost: '12.5',
      });

      const response = await comoGerente('get', `/api/v1/products/${produto.id}`);

      expect(response.body.currentStock).toBe('19.500');
      expect(response.body.minStock).toBe('0.000');
      expect(response.body.unitCost).toBe('12.5000');
    });

    it('decimal é string, nunca number', async () => {
      const categoria = await createCategory(prisma);
      const produto = await createProduct(prisma, categoria.id, { currentStock: '7.25' });

      const response = await comoGerente('get', `/api/v1/products/${produto.id}`);

      expect(typeof response.body.currentStock).toBe('string');
    });

    it('a escala também vale dentro da listagem', async () => {
      const categoria = await createCategory(prisma);
      await createProduct(prisma, categoria.id, { currentStock: '3' });

      const response = await comoGerente('get', '/api/v1/products');

      expect(response.body.data[0].currentStock).toBe('3.000');
    });

    it('não vaza a representação interna do Decimal', async () => {
      const categoria = await createCategory(prisma);
      await createProduct(prisma, categoria.id);

      const response = await comoGerente('get', '/api/v1/products');

      // O defeito existiu: a resposta trazia `{"s":1,"e":1,"d":[10]}`.
      expect(JSON.stringify(response.body)).not.toContain('"d":[');
    });
  });

  // ───────────────────────────────────────────────── paginação e ordenação

  describe('paginação', () => {
    beforeEach(async () => {
      const categoria = await createCategory(prisma);

      for (let i = 1; i <= 25; i += 1) {
        await createProduct(prisma, categoria.id, {
          sku: `PAG-${String(i).padStart(4, '0')}`,
          name: `Produto ${String(i).padStart(2, '0')}`,
        });
      }
    });

    it('usa 20 por página por padrão', async () => {
      const response = await comoGerente('get', '/api/v1/products');

      expect(response.body.data).toHaveLength(20);
      expect(response.body.meta).toMatchObject({
        page: 1,
        limit: 20,
        total: 25,
        totalPages: 2,
        hasNext: true,
        hasPrev: false,
      });
    });

    it('a segunda página traz o resto, sem repetir', async () => {
      const primeira = await comoGerente('get', '/api/v1/products?page=1&limit=10');
      const segunda = await comoGerente('get', '/api/v1/products?page=2&limit=10');

      const idsPrimeira = pageOf<{ id: string }>(primeira).data.map((item) => item.id);
      const idsSegunda = pageOf<{ id: string }>(segunda).data.map((item) => item.id);

      expect(idsSegunda).toHaveLength(10);
      expect(idsPrimeira.some((id) => idsSegunda.includes(id))).toBe(false);
      expect(segunda.body.meta).toMatchObject({ hasPrev: true, hasNext: true });
    });

    it('página além do fim devolve lista vazia, não erro', async () => {
      const response = await comoGerente('get', '/api/v1/products?page=99');

      expect(response.status).toBe(200);
      expect(response.body.data).toEqual([]);
      expect(response.body.meta.hasNext).toBe(false);
    });

    it('limit acima do teto é limitado a 100, não recusado', async () => {
      const response = await comoGerente('get', '/api/v1/products?limit=500');

      // Recusar transformaria um excesso inofensivo em erro de integração
      // (docs/05-api.md §5.1). O teto protege o banco de varredura a pedido.
      expect(response.status).toBe(200);
      expect(response.body.meta.limit).toBe(100);
    });

    it('page=0 é recusado', async () => {
      const response = await comoGerente('get', '/api/v1/products?page=0');

      expect(response.status).toBe(400);
    });

    it('page não numérico é recusado', async () => {
      const response = await comoGerente('get', '/api/v1/products?page=abc');

      expect(response.status).toBe(400);
    });

    it('ordena pela coluna pedida', async () => {
      const response = await comoGerente('get', '/api/v1/products?sort=sku&order=desc');

      const skus = pageOf<{ sku: string }>(response).data.map((item) => item.sku);
      expect(skus[0]).toBe('PAG-0025');
    });

    /**
     * A allowlist de ordenação é controle de segurança, não conveniência: o
     * valor cai no `orderBy` do ORM, e aceitar qualquer string deixaria o
     * cliente escolher a coluna, inclusive as que não deveria saber que
     * existem.
     */
    it('recusa coluna de ordenação fora da allowlist', async () => {
      const response = await comoGerente('get', '/api/v1/products?sort=passwordHash');

      expect(response.status).toBe(400);
    });

    it('recusa order diferente de asc e desc', async () => {
      const response = await comoGerente('get', '/api/v1/products?order=aleatorio');

      expect(response.status).toBe(400);
    });
  });

  describe('filtros e busca', () => {
    it('busca por parte do nome, sem distinguir maiúsculas', async () => {
      const categoria = await createCategory(prisma);
      await createProduct(prisma, categoria.id, { name: 'Chave de fenda' });
      await createProduct(prisma, categoria.id, { name: 'Alicate universal' });

      const response = await comoGerente('get', '/api/v1/products?search=CHAVE');

      expect(response.body.meta.total).toBe(1);
      expect(response.body.data[0].name).toBe('Chave de fenda');
    });

    it('filtra por categoria', async () => {
      const uma = await createCategory(prisma);
      const outra = await createCategory(prisma);
      await createProduct(prisma, uma.id);
      await createProduct(prisma, outra.id);

      const response = await comoGerente('get', `/api/v1/products?categoryId=${uma.id}`);

      expect(response.body.meta.total).toBe(1);
    });

    it('filtra por situação de estoque', async () => {
      const categoria = await createCategory(prisma);
      await createProduct(prisma, categoria.id, { currentStock: '0', minStock: '5' });
      await createProduct(prisma, categoria.id, { currentStock: '3', minStock: '5' });
      await createProduct(prisma, categoria.id, { currentStock: '50', minStock: '5' });

      const semEstoque = await comoGerente('get', '/api/v1/products?stockStatus=out');
      const baixo = await comoGerente('get', '/api/v1/products?stockStatus=low');
      const normal = await comoGerente('get', '/api/v1/products?stockStatus=ok');

      expect(semEstoque.body.meta.total).toBe(1);
      expect(baixo.body.meta.total).toBe(1);
      expect(normal.body.meta.total).toBe(1);
    });

    it('filtra por ativo, tratando o booleano da query string', async () => {
      const categoria = await createCategory(prisma);
      await createProduct(prisma, categoria.id, { isActive: true });
      await createProduct(prisma, categoria.id, { isActive: false });

      const ativos = await comoGerente('get', '/api/v1/products?isActive=true');
      const inativos = await comoGerente('get', '/api/v1/products?isActive=false');

      // `Boolean('false')` é `true`: sem conversão explícita, o filtro de
      // inativos devolveria os ativos.
      expect(ativos.body.meta.total).toBe(1);
      expect(inativos.body.meta.total).toBe(1);
    });

    it('recusa filtro de estoque fora da lista', async () => {
      const response = await comoGerente('get', '/api/v1/products?stockStatus=qualquer');

      expect(response.status).toBe(400);
    });

    it('recusa categoryId que não é UUID', async () => {
      const response = await comoGerente('get', '/api/v1/products?categoryId=abc');

      expect(response.status).toBe(400);
    });
  });
});
