import { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { v7 as uuidv7 } from 'uuid';
import { AppModule } from '../../src/app.module';
import { AuthService } from '../../src/auth/auth.service';
import { applyNotFoundHandler, configureApp } from '../../src/bootstrap';
import { PrismaService } from '../../src/prisma/prisma.service';
import { UserRole } from '../../src/generated/prisma/enums';

/**
 * Infraestrutura das suítes de integração.
 *
 * A aplicação montada aqui é a **mesma** de produção: `configureApp` aplica o
 * mesmo pipeline de guards, pipes e cabeçalhos. Montar uma app diferente no
 * teste faria a suíte aprovar um comportamento que o cliente real não tem.
 */

/** Senha usada por todos os usuários de teste. Atende à política de 10 caracteres. */
export const TEST_PASSWORD = 'senha-de-teste-123';

export interface TestApp {
  app: NestExpressApplication;
  prisma: PrismaService;
  close: () => Promise<void>;
}

export async function createTestApp(): Promise<TestApp> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();

  const app = moduleRef.createNestApplication<NestExpressApplication>();
  configureApp(app);
  await app.init();
  applyNotFoundHandler(app);

  /**
   * ┌──────────────────────────────────────────────────────────────────────────┐
   * │ UM listener por arquivo, e não um por requisição.                        │
   * │                                                                          │
   * │ O supertest, ao receber um servidor que não está escutando, chama        │
   * │ `listen(0)` sozinho e fecha o socket ao fim da requisição. Com uma app    │
   * │ apenas inicializada (`init()` sem `listen()`), isso significa um listener │
   * │ novo a cada chamada: mais de quatrocentos por execução da suíte.          │
   * │                                                                          │
   * │ Escutando uma vez aqui, o supertest encontra `server.address()` já        │
   * │ preenchido e reutiliza o listener existente. Passa a existir um socket    │
   * │ de escuta por arquivo de teste, em vez de um por requisição.             │
   * │                                                                          │
   * │ Esta mudança nasceu como tentativa de explicar o abort intermitente do    │
   * │ processo, e NÃO o explica: a medição mostrou pico de 39 conexões em       │
   * │ TIME_WAIT contra 64.511 portas efêmeras disponíveis, então nunca houve    │
   * │ exaustão. A causa está na camada de sockets do runtime e reproduz fora    │
   * │ daqui (docs/16-relatorio-fase-4.md §16.7). Ficou porque um listener por   │
   * │ arquivo em lugar de centenas é melhor de todo jeito, e deixou a suíte     │
   * │ mais rápida.                                                              │
   * │                                                                          │
   * │ Porta 0: o sistema escolhe uma livre. Fixar a porta faria a suíte         │
   * │ colidir com a API rodando no host durante o desenvolvimento.             │
   * └──────────────────────────────────────────────────────────────────────────┘
   */
  await app.listen(0);

  const prisma = app.get(PrismaService);

  return {
    app,
    prisma,
    close: async () => {
      await app.close();
    },
  };
}

/**
 * Limpa as tabelas entre os casos.
 *
 * A ordem respeita as chaves estrangeiras, e `CASCADE` cuida do resto. Sem
 * isso, a ordem dos testes influenciaria o resultado, que é o tipo de suíte
 * que ensina a equipe a ignorar vermelho.
 */
export async function truncateAll(prisma: PrismaService): Promise<void> {
  await prisma.$executeRawUnsafe(`
    TRUNCATE TABLE
      audit_logs, refresh_tokens, stock_movements, inventory_items,
      inventories, products, categories, suppliers, users
    RESTART IDENTITY CASCADE
  `);
}

export interface TestUser {
  id: string;
  email: string;
  role: UserRole;
}

/**
 * Hash de `TEST_PASSWORD`, calculado UMA vez por processo de teste.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ Argon2id com os parâmetros da OWASP aloca 19 MiB por chamada, e isso é    │
 * │ deliberado: é o custo que torna o ataque de dicionário inviável           │
 * │ (ADR-0004). A suíte cria centenas de usuários no mesmo processo, e todos   │
 * │ usam a mesma senha — então o hash é o mesmo, e calculá-lo uma vez poupa   │
 * │ alguns gigabytes de alocação por execução.                                │
 * │                                                                          │
 * │ Não enfraquece nada: o hash gravado é um Argon2id real, com os parâmetros │
 * │ reais, e o login continua verificando-o de verdade a cada caso — a        │
 * │ verificação é o que está sob teste, e essa não é compartilhada.           │
 * │                                                                          │
 * │ Entrou como tentativa de explicar o abort intermitente do processo e NÃO   │
 * │ o explicou: o cenário controlado SEM nenhuma chamada a Argon2 abortou nas │
 * │ três execuções (docs/16-relatorio-fase-4.md §16.7). Ficou porque é melhor │
 * │ de todo jeito.                                                            │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
let hashMemorizado: Promise<string> | undefined;

function hashDaSenhaDeTeste(): Promise<string> {
  hashMemorizado ??= AuthService.hashPassword(TEST_PASSWORD);

  return hashMemorizado;
}

/**
 * Cria um usuário com e-mail único.
 *
 * O sufixo aleatório importa: a chave do rate limit de login combina IP e
 * e-mail, e reaproveitar o mesmo endereço entre arquivos esgotaria o
 * orçamento de cinco tentativas no meio da suíte.
 */
export async function createUser(
  prisma: PrismaService,
  role: UserRole,
  overrides: { isActive?: boolean; email?: string } = {},
): Promise<TestUser> {
  const email = overrides.email ?? `${role.toLowerCase()}-${uuidv7()}@teste.local`;

  const user = await prisma.user.create({
    data: {
      id: uuidv7(),
      name: `Usuário ${role}`,
      email,
      role,
      passwordHash: await hashDaSenhaDeTeste(),
      isActive: overrides.isActive ?? true,
    },
  });

  return { id: user.id, email: user.email, role: user.role };
}

export interface Session {
  accessToken: string;
  refreshCookie: string;
  user: TestUser;
}

/** Autentica e devolve o token e o cookie de refresh. */
export async function login(
  app: NestExpressApplication,
  user: TestUser,
  password: string = TEST_PASSWORD,
): Promise<Session> {
  const response = await request(app.getHttpServer())
    .post('/api/v1/auth/login')
    .send({ email: user.email, password });

  if (response.status !== 200) {
    throw new Error(
      `login falhou para ${user.email}: ${String(response.status)} ${JSON.stringify(response.body)}`,
    );
  }

  const body = response.body as { accessToken?: unknown };

  return {
    accessToken: typeof body.accessToken === 'string' ? body.accessToken : '',
    refreshCookie: extractRefreshCookie(response.headers['set-cookie']),
    user,
  };
}

/** Cria o usuário e já autentica, que é o caso mais comum nas suítes. */
export async function createSession(
  app: NestExpressApplication,
  prisma: PrismaService,
  role: UserRole,
): Promise<Session> {
  const user = await createUser(prisma, role);

  return login(app, user);
}

/**
 * Extrai o cookie de refresh do cabeçalho `Set-Cookie`.
 *
 * O cabeçalho chega como array quando há mais de um cookie e como string
 * quando há um só, então os dois casos são tratados. A normalização para
 * string acontece por elemento, e não sobre o valor inteiro: `String()` em um
 * array de um elemento funcionaria por acidente, e quebraria no dia em que a
 * resposta trouxesse dois cookies.
 */
export function extractRefreshCookie(header: unknown): string {
  const lista: string[] = Array.isArray(header)
    ? header.map((item: unknown) => (typeof item === 'string' ? item : ''))
    : [typeof header === 'string' ? header : ''];

  const found = lista.find((cookie) => cookie.startsWith('stockflow_refresh='));

  if (!found) {
    throw new Error('cookie de refresh ausente na resposta');
  }

  // Só o par nome=valor: o resto do cabeçalho são atributos que o cliente não
  // devolve.
  return found.split(';')[0] ?? '';
}

/** Cabeçalho de autorização pronto. */
export function bearer(session: Session): string {
  return `Bearer ${session.accessToken}`;
}

/**
 * Fixtures de cadastro criadas **direto no banco**.
 *
 * Criar pela API exigiria uma sessão com papel suficiente só para montar o
 * cenário, e um 403 no preparo apareceria como falha do caso que estava sendo
 * testado. Aqui o preparo não passa pelos guards; o que passa por eles é a
 * requisição sob teste.
 *
 * Os nomes levam sufixo aleatório porque `name`, `taxId` e `sku` são únicos no
 * banco, e um nome fixo colidiria entre casos do mesmo arquivo.
 */
function sufixo(): string {
  return uuidv7().slice(-12);
}

export async function createCategory(
  prisma: PrismaService,
  overrides: { name?: string; isActive?: boolean } = {},
): Promise<{ id: string; name: string }> {
  const category = await prisma.category.create({
    data: {
      id: uuidv7(),
      name: overrides.name ?? `Categoria ${sufixo()}`,
      isActive: overrides.isActive ?? true,
    },
  });

  return { id: category.id, name: category.name };
}

export async function createSupplier(
  prisma: PrismaService,
  overrides: { name?: string; isActive?: boolean } = {},
): Promise<{ id: string; name: string }> {
  const supplier = await prisma.supplier.create({
    data: {
      id: uuidv7(),
      name: overrides.name ?? `Fornecedor ${sufixo()}`,
      isActive: overrides.isActive ?? true,
    },
  });

  return { id: supplier.id, name: supplier.name };
}

export async function createProduct(
  prisma: PrismaService,
  categoryId: string,
  overrides: {
    sku?: string;
    name?: string;
    currentStock?: string;
    minStock?: string;
    unitCost?: string;
    isActive?: boolean;
    supplierId?: string;
  } = {},
): Promise<{ id: string; sku: string; name: string }> {
  const product = await prisma.product.create({
    data: {
      id: uuidv7(),
      sku: overrides.sku ?? `SKU-${sufixo()}`,
      name: overrides.name ?? `Produto ${sufixo()}`,
      categoryId,
      unit: 'UN',
      currentStock: overrides.currentStock ?? '0.000',
      minStock: overrides.minStock ?? '0.000',
      unitCost: overrides.unitCost ?? '0.0000',
      isActive: overrides.isActive ?? true,
      ...(overrides.supplierId !== undefined ? { supplierId: overrides.supplierId } : {}),
    },
  });

  return { id: product.id, sku: product.sku, name: product.name };
}

/**
 * Envelope de paginação da API, tipado.
 *
 * O `response.body` do supertest é `any`, então `body.data.map(...)` dentro de
 * um teste produz chamada e retorno sem tipo — e a regra `no-unsafe-call`
 * aponta cada um, com razão. Estreitar aqui, em um ponto só, deixa os testes
 * sem `as` espalhado e mantém o erro aparecendo caso a forma do envelope mude.
 */
export interface PageEnvelope<T> {
  data: T[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

export function pageOf<T>(response: { body: unknown }): PageEnvelope<T> {
  return response.body as PageEnvelope<T>;
}
