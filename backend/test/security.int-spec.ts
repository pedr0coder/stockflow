import { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { REQUEST_BODY_LIMIT_BYTES } from '../src/bootstrap';
import { PrismaService } from '../src/prisma/prisma.service';
import { UserRole } from '../src/generated/prisma/enums';
import {
  TEST_PASSWORD,
  bearer,
  createCategory,
  createSession,
  createTestApp,
  createUser,
  truncateAll,
  type TestApp,
} from './helpers/app';

/**
 * Controles de segurança que não pertencem a nenhum recurso específico:
 * cabeçalhos, rate limit, forma do erro e o que a resposta de erro revela.
 *
 * O contrato de token e de cookie é verificado em `auth.int-spec.ts`, e a
 * matriz de papéis em `rbac.int-spec.ts`. O que fica aqui é o resto da §8.
 */
describe('Segurança (integração)', () => {
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

  describe('cabeçalhos de resposta', () => {
    it('não anuncia o stack em X-Powered-By', async () => {
      const response = await request(app.getHttpServer()).get('/api/v1/health');

      // Dizer "Express" economiza o reconhecimento para quem procura
      // vulnerabilidade conhecida de versão.
      expect(response.headers['x-powered-by']).toBeUndefined();
    });

    it('impede sniffing de tipo de conteúdo', async () => {
      const response = await request(app.getHttpServer()).get('/api/v1/health');

      expect(response.headers['x-content-type-options']).toBe('nosniff');
    });

    it('nega enquadramento da API em iframe', async () => {
      const response = await request(app.getHttpServer()).get('/api/v1/health');

      expect(response.headers['x-frame-options']?.toUpperCase()).toBe('SAMEORIGIN');
    });

    it('declara política de referrer', async () => {
      const response = await request(app.getHttpServer()).get('/api/v1/health');

      expect(response.headers['referrer-policy']).toBeDefined();
    });
  });

  /**
   * O erro não ensina nada sobre o interior do sistema.
   *
   * Stack trace, nome de arquivo, versão de biblioteca e SQL em mensagem de
   * erro são o material de reconhecimento mais útil que uma API pode entregar
   * de graça (docs/08-seguranca.md §8.6).
   */
  describe('o erro não vaza o interior', () => {
    it('nenhuma resposta de erro traz stack, arquivo ou SQL', async () => {
      const sessao = await createSession(app, prisma, UserRole.MANAGER);

      const respostas = await Promise.all([
        request(app.getHttpServer()).get('/api/v1/nao-existe'),
        request(app.getHttpServer()).get('/api/v1/products/nao-e-uuid'),
        request(app.getHttpServer()).post('/api/v1/auth/login').send({ email: 'x' }),
        request(app.getHttpServer())
          .post('/api/v1/products')
          .set('Authorization', bearer(sessao))
          .send({ sku: 'X' }),
      ]);

      for (const response of respostas) {
        const corpo = JSON.stringify(response.body);

        expect(corpo).not.toContain('stack');
        expect(corpo).not.toContain('node_modules');
        expect(corpo).not.toContain('.ts:');
        expect(corpo).not.toContain('SELECT');
        expect(corpo).not.toContain('prisma');
      }
    });

    it('violação de unicidade não revela nome de índice nem de coluna do banco', async () => {
      const sessao = await createSession(app, prisma, UserRole.MANAGER);
      await createCategory(prisma, { name: 'Repetida' });

      const response = await request(app.getHttpServer())
        .post('/api/v1/categories')
        .set('Authorization', bearer(sessao))
        .send({ name: 'Repetida' });

      expect(response.status).toBe(409);
      expect(JSON.stringify(response.body)).not.toContain('categories_name_key');
      expect(response.body.message).toBe('Já existe uma categoria com este nome.');
    });

    it('todo erro tem code estável, para o cliente decidir a UI sem casar texto', async () => {
      const response = await request(app.getHttpServer()).get('/api/v1/users');

      // Casar a mensagem por texto quebra na primeira vez que alguém a
      // reescreve, e mensagem é conteúdo de produto, não contrato.
      expect(response.body.code).toBe('UNAUTHORIZED');
      expect(response.body.statusCode).toBe(401);
    });
  });

  /**
   * RATE LIMIT do login, com chave composta por IP e conta.
   *
   * A chave é o ponto: só por IP permitiria testar uma senha em mil contas do
   * mesmo endereço; só por e-mail permitiria bloquear a conta de outra pessoa
   * de propósito (docs/08-seguranca.md §8.7).
   */
  describe('rate limit do login', () => {
    it('bloqueia depois de cinco tentativas na mesma conta', async () => {
      const usuario = await createUser(prisma, UserRole.OPERATOR);
      const tentativa = () =>
        request(app.getHttpServer())
          .post('/api/v1/auth/login')
          .send({ email: usuario.email, password: 'senha-errada-mas-longa' });

      const statusObtidos: number[] = [];

      // Sequencial de propósito: o limite conta requisições, e em paralelo o
      // número que cada uma vê depende da ordem de chegada.
      for (let i = 0; i < 6; i += 1) {
        statusObtidos.push((await tentativa()).status);
      }

      expect(statusObtidos.slice(0, 5)).toEqual([401, 401, 401, 401, 401]);
      expect(statusObtidos[5]).toBe(429);
    });

    it('o 429 segue o mesmo contrato de erro', async () => {
      const usuario = await createUser(prisma, UserRole.OPERATOR);

      let ultima = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: usuario.email, password: 'errada-mas-longa' });

      for (let i = 0; i < 6 && ultima.status !== 429; i += 1) {
        ultima = await request(app.getHttpServer())
          .post('/api/v1/auth/login')
          .send({ email: usuario.email, password: 'errada-mas-longa' });
      }

      expect(ultima.status).toBe(429);
      expect(ultima.body).toMatchObject({ statusCode: 429, code: 'RATE_LIMIT_EXCEEDED' });
      // A mensagem do framework é "ThrottlerException: Too Many Requests":
      // inglês, com o nome da classe do guard. Vazava na resposta.
      expect(ultima.body.message).toBe('Muitas tentativas. Aguarde alguns minutos.');
    });

    it('estourar o limite de uma conta não bloqueia o login de outra', async () => {
      const vitima = await createUser(prisma, UserRole.OPERATOR);
      const outra = await createUser(prisma, UserRole.OPERATOR);

      for (let i = 0; i < 6; i += 1) {
        await request(app.getHttpServer())
          .post('/api/v1/auth/login')
          .send({ email: vitima.email, password: 'errada-mas-longa' });
      }

      // Se a chave fosse só o IP, esta requisição também seria bloqueada, e
      // qualquer pessoa poderia derrubar o login de toda a rede de uma empresa.
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: outra.email, password: TEST_PASSWORD });

      expect(response.status).toBe(200);
    });

    it('acertar a senha depois de tentativas erradas ainda funciona dentro do limite', async () => {
      const usuario = await createUser(prisma, UserRole.OPERATOR);

      for (let i = 0; i < 3; i += 1) {
        await request(app.getHttpServer())
          .post('/api/v1/auth/login')
          .send({ email: usuario.email, password: 'errada-mas-longa' });
      }

      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: usuario.email, password: TEST_PASSWORD });

      expect(response.status).toBe(200);
    });
  });

  describe('o limite geral não se aplica às rotas de autenticação', () => {
    it('o login tem limite próprio, mais estrito que o geral', async () => {
      const usuario = await createUser(prisma, UserRole.OPERATOR);

      // Se o guard geral também contasse, o orçamento de 100 escritas
      // mascararia o de 5 tentativas, e o 429 abaixo viria no lugar errado.
      const statusObtidos: number[] = [];

      for (let i = 0; i < 6; i += 1) {
        statusObtidos.push(
          (
            await request(app.getHttpServer())
              .post('/api/v1/auth/login')
              .send({ email: usuario.email, password: 'errada-mas-longa' })
          ).status,
        );
      }

      expect(statusObtidos.filter((status) => status === 429)).toHaveLength(1);
    });
  });

  /**
   * SQL e HTML vindos do cliente não são interpretados.
   *
   * O Prisma parametriza, então a injeção não deveria ser possível. O teste
   * existe porque "não deveria" não é verificação, e porque a busca textual
   * monta `ILIKE` a partir de entrada do usuário.
   */
  describe('entrada hostil é dado, não código', () => {
    it('tentativa de injeção na busca devolve lista vazia, não erro de banco', async () => {
      const sessao = await createSession(app, prisma, UserRole.MANAGER);
      const categoria = await createCategory(prisma);
      await createProdutoSimples(prisma, categoria.id);

      const response = await request(app.getHttpServer())
        .get(`/api/v1/products?search=${encodeURIComponent("'; DROP TABLE products; --")}`)
        .set('Authorization', bearer(sessao));

      expect(response.status).toBe(200);
      expect(response.body.data).toEqual([]);

      // E a tabela continua lá, com o produto dentro.
      expect(await prisma.product.count()).toBe(1);
    });

    it('caractere curinga do LIKE é tratado como texto', async () => {
      const sessao = await createSession(app, prisma, UserRole.MANAGER);
      const categoria = await createCategory(prisma);
      await createProdutoSimples(prisma, categoria.id);

      const response = await request(app.getHttpServer())
        .get('/api/v1/products?search=%25')
        .set('Authorization', bearer(sessao));

      // `%` como busca não deve casar com tudo: se casasse, o cliente poderia
      // ler a tabela inteira ignorando o filtro.
      expect(response.status).toBe(200);
      expect(response.body.meta.total).toBe(0);
    });

    it('o curinga não vaza entre recursos: busca por _ não casa com qualquer caractere', async () => {
      const sessao = await createSession(app, prisma, UserRole.ADMIN);
      await createUser(prisma, UserRole.OPERATOR, { email: 'abc@teste.local' });

      const response = await request(app.getHttpServer())
        .get('/api/v1/users?search=a_c')
        .set('Authorization', bearer(sessao));

      // Sem escape, `a_c` casaria com "abc": o filtro deixaria de ser filtro.
      expect(response.body.meta.total).toBe(0);
    });

    it('termo com % literal encontra o registro que o contém', async () => {
      const sessao = await createSession(app, prisma, UserRole.MANAGER);
      await createCategory(prisma, { name: 'Desconto 50% final' });
      await createCategory(prisma, { name: 'Sem desconto' });

      const response = await request(app.getHttpServer())
        .get('/api/v1/categories?search=50%25')
        .set('Authorization', bearer(sessao));

      // Antes do escape, isto devolvia as duas categorias.
      expect(response.body.meta.total).toBe(1);
      expect(response.body.data[0].name).toBe('Desconto 50% final');
    });

    it('HTML no nome é armazenado e devolvido como texto, sem escapar nem executar', async () => {
      const sessao = await createSession(app, prisma, UserRole.MANAGER);
      const nome = '<script>alert(1)</script>';

      const criada = await request(app.getHttpServer())
        .post('/api/v1/categories')
        .set('Authorization', bearer(sessao))
        .send({ name: nome })
        .expect(201);

      // A API devolve JSON e não renderiza nada: escapar aqui corromperia o
      // dado. A defesa contra XSS é do cliente, que não usa innerHTML.
      expect(criada.body.name).toBe(nome);
      expect(criada.headers['content-type']).toContain('application/json');
    });

    it('corpo com __proto__ não contamina o protótipo', async () => {
      const sessao = await createSession(app, prisma, UserRole.MANAGER);

      const response = await request(app.getHttpServer())
        .post('/api/v1/categories')
        .set('Authorization', bearer(sessao))
        .set('Content-Type', 'application/json')
        .send('{"name":"Categoria","__proto__":{"poluido":true}}');

      // O campo não está no DTO: `forbidNonWhitelisted` o recusa antes de
      // qualquer atribuição.
      expect([400, 201]).toContain(response.status);
      expect(({} as Record<string, unknown>)['poluido']).toBeUndefined();
    });
  });

  describe('o corpo da requisição tem limite', () => {
    /**
     * O 413 e o JSON malformado viravam 500.
     *
     * O `body-parser` não lança `HttpException`: lança um `Error` comum com
     * `status`, pela convenção `http-errors`. O filtro só reconhecia
     * `HttpException`, então os dois casos caíam no 500 genérico — "Erro
     * interno. Tente novamente", que é falso, manda a pessoa procurar no lugar
     * errado, e registra erro de cliente como falha de servidor no alerta de
     * 5xx. Encontrado por este caso.
     */
    it('corpo acima do limite responde 413, não 500', async () => {
      const sessao = await createSession(app, prisma, UserRole.MANAGER);

      const response = await request(app.getHttpServer())
        .post('/api/v1/categories')
        .set('Authorization', bearer(sessao))
        .send({ name: 'Categoria', description: 'x'.repeat(2_000_000) });

      expect(response.status).toBe(413);
      expect(response.body).toMatchObject({ statusCode: 413, code: 'PAYLOAD_TOO_LARGE' });
    });

    it('JSON malformado responde 400, não 500', async () => {
      const sessao = await createSession(app, prisma, UserRole.MANAGER);

      const response = await request(app.getHttpServer())
        .post('/api/v1/categories')
        .set('Authorization', bearer(sessao))
        .set('Content-Type', 'application/json')
        .send('{"name": "Categoria",}');

      expect(response.status).toBe(400);
      expect(response.body.code).toBe('VALIDATION_ERROR');
    });

    it('o erro de corpo malformado não vaza a mensagem da biblioteca', async () => {
      const sessao = await createSession(app, prisma, UserRole.MANAGER);

      const response = await request(app.getHttpServer())
        .post('/api/v1/categories')
        .set('Authorization', bearer(sessao))
        .set('Content-Type', 'application/json')
        .send('{nao e json}');

      // A mensagem original é em inglês e cita posição no buffer.
      expect(response.body.message).not.toContain('JSON');
      expect(response.body.message).not.toContain('position');
    });
  });

  /**
   * O limite é decisão declarada (`REQUEST_BODY_LIMIT_BYTES`), e não herança do
   * padrão do Express. O caso acima, com 2 MB, passaria com qualquer valor
   * razoável; estes fixam a FRONTEIRA, e quebram se alguém trocar o número ou
   * voltar a depender do padrão (100 KiB): o caso "no limite" ainda passaria,
   * mas o "um byte acima" deixaria de ser 413.
   */
  describe('o limite do corpo é o declarado, byte a byte', () => {
    it('corpo exatamente no limite é aceito pelo parser e cai na validação', async () => {
      const sessao = await createSession(app, prisma, UserRole.MANAGER);

      const response = await request(app.getHttpServer())
        .post('/api/v1/categories')
        .set('Authorization', bearer(sessao))
        .set('Content-Type', 'application/json')
        .send(categoriaComCorpoDe(REQUEST_BODY_LIMIT_BYTES));

      // 400 de VALIDAÇÃO (o nome tem 80 caracteres no máximo): prova que o
      // parser leu o corpo inteiro. Um 413 aqui significaria limite menor que
      // o declarado.
      expect(response.status).toBe(400);
      expect(response.body.code).toBe('VALIDATION_ERROR');
      expect(response.body.details.fields).toHaveProperty('name');
    });

    it('um byte acima do limite responde 413', async () => {
      const sessao = await createSession(app, prisma, UserRole.MANAGER);

      const response = await request(app.getHttpServer())
        .post('/api/v1/categories')
        .set('Authorization', bearer(sessao))
        .set('Content-Type', 'application/json')
        .send(categoriaComCorpoDe(REQUEST_BODY_LIMIT_BYTES + 1));

      expect(response.status).toBe(413);
    });

    it('o 413 segue o contrato único de erro, em português, sem vazar a biblioteca', async () => {
      const sessao = await createSession(app, prisma, UserRole.MANAGER);

      const response = await request(app.getHttpServer())
        .post('/api/v1/categories')
        .set('Authorization', bearer(sessao))
        .set('Content-Type', 'application/json')
        .send(categoriaComCorpoDe(REQUEST_BODY_LIMIT_BYTES + 1));

      expect(Object.keys(response.body).sort()).toEqual(
        ['code', 'message', 'path', 'requestId', 'statusCode', 'timestamp'].sort(),
      );
      expect(response.body).toMatchObject({
        statusCode: 413,
        code: 'PAYLOAD_TOO_LARGE',
        message: 'Corpo da requisição acima do limite aceito.',
        path: '/api/v1/categories',
      });
      // A mensagem da biblioteca é em inglês ("request entity too large") e cita
      // bytes. `\blimit\b` e não `limit`: "limite", do texto do projeto, contém
      // a segunda forma e não é vazamento.
      expect(JSON.stringify(response.body)).not.toMatch(/entity too large|bytes|\blimit\b/i);
    });

    it('o limite vale antes da autenticação, inclusive na rota pública de login', async () => {
      // O corpo é lido antes dos guards. Sem isto, qualquer pessoa na internet
      // faria o servidor ler e interpretar o volume que quisesse em /auth/login.
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .set('Content-Type', 'application/json')
        .send(categoriaComCorpoDe(REQUEST_BODY_LIMIT_BYTES + 1));

      expect(response.status).toBe(413);
      expect(response.body.code).toBe('PAYLOAD_TOO_LARGE');
    });

    it('requisição sem token e com corpo enorme é 413, não 401', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/products')
        .set('Content-Type', 'application/json')
        .send(categoriaComCorpoDe(REQUEST_BODY_LIMIT_BYTES + 1));

      // Documenta a ordem real: o parser roda antes do guard. É o que o limite
      // precisa ser para proteger a rota pública; só vale como comportamento
      // se alguém reordenar os middlewares e este caso apontar.
      expect(response.status).toBe(413);
    });

    it('o limite também vale para corpo de formulário (urlencoded)', async () => {
      const sessao = await createSession(app, prisma, UserRole.MANAGER);

      const response = await request(app.getHttpServer())
        .post('/api/v1/categories')
        .set('Authorization', bearer(sessao))
        .type('form')
        .send(`name=${'a'.repeat(REQUEST_BODY_LIMIT_BYTES)}`);

      expect(response.status).toBe(413);
      expect(response.body.code).toBe('PAYLOAD_TOO_LARGE');
    });
  });

  /**
   * Corpo ilegível é erro de CLIENTE, em todas as formas que ele pode ter.
   *
   * O defeito que a Fase 4 encontrou (500 para JSON malformado) tinha uma causa
   * só, mas o corpo errado chega de muitas formas. Cada linha é uma delas, e
   * a asserção é a mesma: 4xx no contrato único, nunca 5xx.
   */
  describe('corpo ilegível é sempre 4xx no contrato único', () => {
    const CASOS: {
      nome: string;
      corpo: string;
      tipo?: string;
      cabecalhos?: Record<string, string>;
      status: number;
    }[] = [
      { nome: 'JSON truncado', corpo: '{"name":"Categ', status: 400 },
      { nome: 'vírgula sobrando', corpo: '{"name":"Categoria",}', status: 400 },
      { nome: 'aspas simples', corpo: "{'name':'Categoria'}", status: 400 },
      { nome: 'texto solto', corpo: 'isto não é json', status: 400 },
      { nome: 'string no topo (modo estrito)', corpo: '"Categoria"', status: 400 },
      { nome: 'número no topo (modo estrito)', corpo: '42', status: 400 },
      { nome: 'null no topo (modo estrito)', corpo: 'null', status: 400 },
      { nome: 'corpo vazio com content-type JSON', corpo: '', status: 400 },
      { nome: 'array no lugar de objeto', corpo: '[{"name":"Categoria"}]', status: 400 },
      {
        nome: 'charset não suportado',
        corpo: '{"name":"Categoria"}',
        // Fora da família `utf-*`: o body-parser só recusa o que não começa assim,
        // então `utf-7` é aceito e decodificado (comportamento da biblioteca, e
        // não defeito). `iso-8859-1` é o caso que ele recusa com 415.
        tipo: 'application/json; charset=iso-8859-1',
        status: 415,
      },
      {
        nome: 'content-encoding desconhecido',
        corpo: '{"name":"Categoria"}',
        cabecalhos: { 'Content-Encoding': 'desconhecido' },
        status: 415,
      },
      {
        nome: 'JSON válido com content-type de texto (corpo não interpretado)',
        corpo: '{"name":"Categoria"}',
        tipo: 'text/plain',
        status: 400,
      },
    ];

    it.each(CASOS)('$nome responde $status no contrato único', async (caso) => {
      const sessao = await createSession(app, prisma, UserRole.MANAGER);

      let chamada = request(app.getHttpServer())
        .post('/api/v1/categories')
        .set('Authorization', bearer(sessao))
        .set('Content-Type', caso.tipo ?? 'application/json');

      for (const [nome, valor] of Object.entries(caso.cabecalhos ?? {})) {
        chamada = chamada.set(nome, valor);
      }

      const response = await chamada.send(caso.corpo);

      expect(response.status).toBe(caso.status);
      expect(response.status).toBeLessThan(500);
      expect(Object.keys(response.body).sort()).toEqual(
        expect.arrayContaining(['code', 'message', 'path', 'requestId', 'statusCode', 'timestamp']),
      );
      expect(response.body.statusCode).toBe(caso.status);
      expect(response.body.requestId).toEqual(expect.any(String));
      // Nenhuma mensagem de biblioteca (inglês, posição no buffer, nome de módulo).
      expect(response.body.message).not.toMatch(
        /JSON|position|token|charset|encoding|body-parser/i,
      );
      expect(JSON.stringify(response.body)).not.toMatch(/node_modules|\.ts:|stack/);
    });

    it('JSON malformado não cria nada: o banco continua vazio', async () => {
      const sessao = await createSession(app, prisma, UserRole.MANAGER);

      await request(app.getHttpServer())
        .post('/api/v1/categories')
        .set('Authorization', bearer(sessao))
        .set('Content-Type', 'application/json')
        .send('{"name":"Categoria",}')
        .expect(400);

      expect(await prisma.category.count()).toBe(0);
    });
  });
});

/**
 * Corpo JSON de categoria com EXATAMENTE `bytes` bytes.
 *
 * Só ASCII, então caractere e byte coincidem. O nome fica longo demais de
 * propósito: o que se mede aqui é o parser, e o caso que passa dele precisa
 * terminar na validação, nunca criando registro.
 */
function categoriaComCorpoDe(bytes: number): string {
  const prefixo = '{"name":"';
  const sufixo = '"}';
  const corpo = prefixo + 'a'.repeat(bytes - prefixo.length - sufixo.length) + sufixo;

  if (Buffer.byteLength(corpo) !== bytes) {
    throw new Error(
      `fixture com ${String(Buffer.byteLength(corpo))} bytes, esperado ${String(bytes)}`,
    );
  }

  return corpo;
}

/** Produto mínimo, sem depender do helper de fixture com nome aleatório. */
async function createProdutoSimples(prisma: PrismaService, categoryId: string): Promise<void> {
  await prisma.product.create({
    data: {
      id: crypto.randomUUID(),
      sku: 'SEC-0001',
      name: 'Produto de segurança',
      categoryId,
      unit: 'UN',
    },
  });
}
