import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  CONTROLLER_WATERMARK,
  METHOD_METADATA,
  MODULE_METADATA,
  PATH_METADATA,
} from '@nestjs/common/constants';
import { Controller, Get, Post, RequestMethod } from '@nestjs/common';
import { beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../../app.module';
import { IS_PUBLIC_KEY, Public } from '../decorators/public.decorator';
import { ROLES_KEY, Roles } from '../decorators/roles.decorator';
import { UserRole } from '../../generated/prisma/enums';

/**
 * Inventário executável de toda rota HTTP registrada, com seu nível de
 * exigência real (`@Public()` / `@Roles(...)` / nenhum dos dois, que
 * significa "qualquer autenticado" — `roles.guard.ts`).
 *
 * O que este arquivo resolve, e o que `roles.guard.spec.ts` já documenta como
 * fora do seu alcance ("não garante que a rota recebeu o decorator certo"):
 * uma rota NOVA, cadastrada num controller sem `@Roles()` nem `@Public()`,
 * passa a existir com "qualquer autenticado" sem que ninguém tenha decidido
 * isso de propósito. `rbac.int-spec.ts` cobre a matriz de rotas conhecidas,
 * mas depende de alguém lembrar de acrescentar a rota nova a ela — e esse é
 * exatamente o tipo de esquecimento que este teste pega, porque ele não lista
 * rotas manualmente: ele enumera as rotas REAIS, lidas por reflexão a partir
 * dos controllers, e compara contra a lista revisada abaixo.
 *
 * Rota nova, renomeada ou com decorator alterado => este teste quebra, e quem
 * fez a mudança precisa atualizar `ROTAS_REVISADAS` de propósito, deixando
 * uma decisão de exigência registrada em vez de um default silencioso.
 *
 * Os CONTROLLERS são descobertos por duas vias independentes que precisam
 * coincidir:
 *   1. varredura de `src/` por `*.controller.ts` com watermark `@Controller()`;
 *   2. travessia do grafo de módulos a partir de `AppModule` (`imports` e
 *      `controllers`), pegando qualquer controller registrado no Nest mesmo
 *      que o arquivo não seguisse a convenção `*.controller.ts`.
 */

type Nivel =
  | { tipo: 'public' }
  | { tipo: 'anyAuthenticated' }
  | { tipo: 'roles'; roles: UserRole[] }
  | { tipo: 'conflicting'; roles: UserRole[] };

interface RotaReal {
  metodo: string;
  caminho: string;
  nivel: Nivel;
}

type ControllerClassType = new (...args: never[]) => unknown;

const SRC_DIR = join(__dirname, '..', '..');

/**
 * Varre `src/` por arquivos `*.controller.ts`, fora de `generated/` e fora
 * de `node_modules/`.
 */
function encontrarArquivosDeController(diretorio: string): string[] {
  const encontrados: string[] = [];

  for (const entrada of readdirSync(diretorio, { withFileTypes: true })) {
    if (entrada.name === 'generated' || entrada.name === 'node_modules') {
      continue;
    }

    const caminho = join(diretorio, entrada.name);

    if (entrada.isDirectory()) {
      encontrados.push(...encontrarArquivosDeController(caminho));
    } else if (entrada.isFile() && entrada.name.endsWith('.controller.ts')) {
      encontrados.push(caminho);
    }
  }

  return encontrados;
}

/** `true` só para uma classe de verdade marcada com `@Controller()` do Nest. */
function ehClasseDeController(valor: unknown): valor is ControllerClassType {
  return typeof valor === 'function' && Reflect.hasMetadata(CONTROLLER_WATERMARK, valor);
}

async function descobrirControllersNoFilesystem(): Promise<ControllerClassType[]> {
  const controllers: ControllerClassType[] = [];

  for (const arquivo of encontrarArquivosDeController(SRC_DIR)) {
    const modulo = (await import(arquivo)) as Record<string, unknown>;

    for (const exportado of Object.values(modulo)) {
      if (ehClasseDeController(exportado)) {
        controllers.push(exportado);
      }
    }
  }

  return controllers;
}

/**
 * Percorre recursivamente `AppModule` via metadados `imports` e `controllers`
 * do NestJS para encontrar todo controller registrado na árvore de módulos,
 * independente do nome do arquivo em que foi declarado.
 */
function descobrirControllersNoAppModule(
  moduloRaiz: unknown,
  visitados = new Set<unknown>(),
): ControllerClassType[] {
  if (!moduloRaiz || visitados.has(moduloRaiz)) {
    return [];
  }
  visitados.add(moduloRaiz);

  const alvo =
    typeof moduloRaiz === 'object' && 'module' in moduloRaiz ? moduloRaiz.module : moduloRaiz;

  if (typeof alvo !== 'function') {
    return [];
  }

  const controllersDiretos =
    (Reflect.getMetadata(MODULE_METADATA.CONTROLLERS, alvo) as ControllerClassType[] | undefined) ??
    [];
  const imports =
    (Reflect.getMetadata(MODULE_METADATA.IMPORTS, alvo) as unknown[] | undefined) ?? [];

  const controllersImportados = imports.flatMap((importado) =>
    descobrirControllersNoAppModule(importado, visitados),
  );

  return [...controllersDiretos, ...controllersImportados];
}

function juntarCaminho(prefixo: string, sufixo: string): string {
  const partes = [prefixo, sufixo].filter((parte) => parte.length > 0);

  return `/${partes.join('/')}`.replace(/\/{2,}/g, '/').replace(/\/$/, '') || '/';
}

/**
 * Lê `@Public()` e `@Roles()` na mesma ordem de precedência usada por
 * `JwtAuthGuard` e `RolesGuard` (`getAllAndOverride`: método -> classe),
 * detectando também o caso inválido de ambos estarem presentes ao mesmo tempo.
 */
function nivelDoHandler(handler: object, ControllerClass: ControllerClassType): Nivel {
  const isPublicHandler = Reflect.getMetadata(IS_PUBLIC_KEY, handler) as boolean | undefined;
  const isPublicClass = Reflect.getMetadata(IS_PUBLIC_KEY, ControllerClass) as boolean | undefined;
  const isPublic = (isPublicHandler ?? isPublicClass) === true;

  const rolesHandler = Reflect.getMetadata(ROLES_KEY, handler) as UserRole[] | undefined;
  const rolesClass = Reflect.getMetadata(ROLES_KEY, ControllerClass) as UserRole[] | undefined;
  const roles = rolesHandler ?? rolesClass;
  const hasRoles = roles !== undefined && roles.length > 0;

  if (isPublic && hasRoles) {
    return { tipo: 'conflicting', roles: [...roles].sort() };
  }

  if (isPublic) {
    return { tipo: 'public' };
  }

  if (!hasRoles) {
    return { tipo: 'anyAuthenticated' };
  }

  return { tipo: 'roles', roles: [...roles].sort() };
}

/** Lê, por reflexão, toda rota declarada em um controller — sem montar o Nest. */
function rotasDoController(ControllerClass: ControllerClassType): RotaReal[] {
  const prefixo = (Reflect.getMetadata(PATH_METADATA, ControllerClass) as string | undefined) ?? '';
  const prototype = ControllerClass.prototype as Record<string, unknown>;
  const rotas: RotaReal[] = [];

  for (const nomeDoMetodo of Object.getOwnPropertyNames(prototype)) {
    const handler = prototype[nomeDoMetodo];

    if (typeof handler !== 'function' || nomeDoMetodo === 'constructor') {
      continue;
    }

    const metodoHttp = Reflect.getMetadata(METHOD_METADATA, handler) as RequestMethod | undefined;

    if (metodoHttp === undefined) {
      continue;
    }

    const sufixo = (Reflect.getMetadata(PATH_METADATA, handler) as string | undefined) ?? '';

    rotas.push({
      metodo: RequestMethod[metodoHttp] ?? String(metodoHttp),
      caminho: juntarCaminho(prefixo, sufixo),
      nivel: nivelDoHandler(handler, ControllerClass),
    });
  }

  return rotas.sort((a, b) => `${a.metodo} ${a.caminho}`.localeCompare(`${b.metodo} ${b.caminho}`));
}

function formatarNivel(nivel: Nivel): string {
  if (nivel.tipo === 'public') return 'public';
  if (nivel.tipo === 'anyAuthenticated') return 'anyAuthenticated';
  if (nivel.tipo === 'conflicting') return `conflicting:public+roles:${nivel.roles.join(',')}`;
  return `roles:${nivel.roles.join(',')}`;
}

/**
 * Verifica que o conjunto de rotas reais bate exatamente com o mapa revisado
 * e que nenhuma rota possui decorators conflitantes.
 */
function auditarRotas(rotasReais: RotaReal[], mapaRevisado: Record<string, string>): void {
  const chavesReais = new Set<string>();

  for (const rota of rotasReais) {
    const chave = `${rota.metodo} ${rota.caminho}`;
    chavesReais.add(chave);

    if (rota.nivel.tipo === 'conflicting') {
      throw new Error(
        `Rota "${chave}" declara @Public() e @Roles() simultaneamente (${formatarNivel(rota.nivel)}).`,
      );
    }

    const esperado = mapaRevisado[chave];

    if (esperado === undefined) {
      throw new Error(
        `Rota "${chave}" (nível detectado: "${formatarNivel(rota.nivel)}") não está em ROTAS_REVISADAS. ` +
          `Se é nova, decida o nível de exigência de propósito (public / @Roles / "qualquer autenticado" ` +
          `aceito como decisão) e acrescente-a à lista.`,
      );
    }

    const nivelAtual = formatarNivel(rota.nivel);
    if (nivelAtual !== esperado) {
      throw new Error(
        `Rota "${chave}" mudou de nível de exigência (esperado "${esperado}", encontrado "${nivelAtual}"). ` +
          `Se a mudança é intencional, atualize ROTAS_REVISADAS; se não é, corrija o decorator.`,
      );
    }
  }

  for (const chave of Object.keys(mapaRevisado)) {
    if (!chavesReais.has(chave)) {
      throw new Error(`Rota "${chave}" estava revisada e não existe mais.`);
    }
  }
}

const { ADMIN, MANAGER } = UserRole;

/**
 * A lista revisada. Cada linha foi confirmada contra `docs/05-api.md` e
 * `rbac.int-spec.ts` nesta sessão (Marco 7A). Mudar uma rota sem revisar esta
 * lista quebra o teste de propósito.
 */
const ROTAS_REVISADAS: Record<string, string> = {
  'GET /audit': 'roles:ADMIN',
  'GET /audit/:entity/:entityId': `roles:${[ADMIN, MANAGER].sort().join(',')}`,

  'POST /auth/login': 'public',
  'POST /auth/refresh': 'public',
  'POST /auth/logout': 'public',
  'GET /auth/me': 'anyAuthenticated',

  'GET /categories': 'anyAuthenticated',
  'GET /categories/:id': 'anyAuthenticated',
  'POST /categories': `roles:${[ADMIN, MANAGER].sort().join(',')}`,
  'PATCH /categories/:id': `roles:${[ADMIN, MANAGER].sort().join(',')}`,
  'PATCH /categories/:id/status': `roles:${[ADMIN, MANAGER].sort().join(',')}`,

  'GET /dashboard/summary': 'anyAuthenticated',
  'GET /dashboard/movements-chart': 'anyAuthenticated',
  'GET /dashboard/recent-movements': 'anyAuthenticated',

  'GET /health': 'public',
  'GET /health/ready': 'public',

  'GET /inventories': 'anyAuthenticated',
  'GET /inventories/:id': 'anyAuthenticated',
  'POST /inventories': `roles:${[ADMIN, MANAGER].sort().join(',')}`,
  'PATCH /inventories/:id/items/:itemId/count': 'anyAuthenticated',
  'POST /inventories/:id/submit': 'anyAuthenticated',
  'POST /inventories/:id/approve': `roles:${[ADMIN, MANAGER].sort().join(',')}`,
  'POST /inventories/:id/cancel': `roles:${[ADMIN, MANAGER].sort().join(',')}`,

  'GET /products': 'anyAuthenticated',
  'GET /products/:id': 'anyAuthenticated',
  'GET /products/:id/movements': 'anyAuthenticated',
  'POST /products': `roles:${[ADMIN, MANAGER].sort().join(',')}`,
  'PATCH /products/:id': `roles:${[ADMIN, MANAGER].sort().join(',')}`,
  'PATCH /products/:id/status': `roles:${[ADMIN, MANAGER].sort().join(',')}`,

  'GET /reports/low-stock': 'anyAuthenticated',
  'GET /reports/out-of-stock': 'anyAuthenticated',
  'GET /reports/movements': 'anyAuthenticated',
  'GET /reports/inventories': `roles:${[ADMIN, MANAGER].sort().join(',')}`,
  'GET /reports/divergences': `roles:${[ADMIN, MANAGER].sort().join(',')}`,
  'GET /reports/stock-reconciliation': 'roles:ADMIN',

  'GET /stock-movements': 'anyAuthenticated',
  'GET /stock-movements/:id': 'anyAuthenticated',
  'POST /stock-movements/in': 'anyAuthenticated',
  'POST /stock-movements/out': 'anyAuthenticated',
  'POST /stock-movements/adjustment': `roles:${[ADMIN, MANAGER].sort().join(',')}`,

  'GET /suppliers': 'anyAuthenticated',
  'GET /suppliers/:id': 'anyAuthenticated',
  'GET /suppliers/:id/products': 'anyAuthenticated',
  'POST /suppliers': `roles:${[ADMIN, MANAGER].sort().join(',')}`,
  'PATCH /suppliers/:id': `roles:${[ADMIN, MANAGER].sort().join(',')}`,
  'PATCH /suppliers/:id/status': `roles:${[ADMIN, MANAGER].sort().join(',')}`,

  'PATCH /users/me/password': 'anyAuthenticated',
  'GET /users': `roles:${[ADMIN, MANAGER].sort().join(',')}`,
  'GET /users/:id': `roles:${[ADMIN, MANAGER].sort().join(',')}`,
  'POST /users': 'roles:ADMIN',
  'PATCH /users/:id': 'roles:ADMIN',
  'PATCH /users/:id/role': 'roles:ADMIN',
  'PATCH /users/:id/status': 'roles:ADMIN',
};

describe('cobertura de autorização por rota (Marco 7A, S10)', () => {
  let controllersFilesystem: ControllerClassType[];
  let controllersAppModule: ControllerClassType[];
  let rotasReais: RotaReal[];
  let chavesReais: Set<string>;

  beforeAll(async () => {
    controllersFilesystem = await descobrirControllersNoFilesystem();
    controllersAppModule = descobrirControllersNoAppModule(AppModule);
    const uniaoControllers = Array.from(
      new Set([...controllersFilesystem, ...controllersAppModule]),
    );
    rotasReais = uniaoControllers.flatMap((Ctrl) => rotasDoController(Ctrl));
    chavesReais = new Set(rotasReais.map((rota) => `${rota.metodo} ${rota.caminho}`));
  });

  /**
   * Trava sobre a própria descoberta: 11 controllers, 53 rotas — tanto por
   * varredura de arquivos quanto pelo grafo de módulos de `AppModule`.
   */
  it('descobre exatamente os controllers e rotas esperados em src/ e no AppModule', () => {
    const nomesFs = controllersFilesystem.map((c) => c.name).sort();
    const nomesApp = controllersAppModule.map((c) => c.name).sort();

    expect(nomesFs, 'controllers em src/**/*.controller.ts vs AppModule').toEqual(nomesApp);
    expect(controllersFilesystem.length, 'número de controllers descobertos em src/').toBe(11);
    expect(rotasReais.length, 'número de rotas descobertas nos controllers').toBe(53);
  });

  it('nenhuma rota nova ou alterada escapou da revisão', () => {
    expect(() => auditarRotas(rotasReais, ROTAS_REVISADAS)).not.toThrow();
  });

  it('nenhuma rota revisada desapareceu silenciosamente', () => {
    for (const chave of Object.keys(ROTAS_REVISADAS)) {
      expect(chavesReais.has(chave), `Rota "${chave}" estava revisada e não existe mais.`).toBe(
        true,
      );
    }
  });

  it('toda rota tem exatamente um nível — nunca mais de um decorator conflitante', () => {
    for (const rota of rotasReais) {
      const chave = `${rota.metodo} ${rota.caminho}`;

      expect(rota.nivel.tipo, chave).not.toBe('conflicting');
      expect(['public', 'anyAuthenticated', 'roles'].includes(rota.nivel.tipo), chave).toBe(true);
    }
  });

  it('detecta imediatamente um novo controller ou endpoint sem política de autorização revisada', () => {
    @Controller('novo-recurso')
    class NovoControllerSemPolitica {
      @Get()
      listarSemDecorator(): void {}
    }

    const rotasComNovoEndpoint = [...rotasReais, ...rotasDoController(NovoControllerSemPolitica)];

    expect(() => auditarRotas(rotasComNovoEndpoint, ROTAS_REVISADAS)).toThrow(
      /Rota "GET \/novo-recurso" \(nível detectado: "anyAuthenticated"\) não está em ROTAS_REVISADAS/,
    );
  });

  it('detecta quando um endpoint existente perde seu @Roles() ou muda de política', () => {
    @Controller('users')
    class UsersControllerAdulterado {
      @Post()
      criarSemRoles(): void {}
    }

    const rotasAdulteradas = [
      ...rotasReais.filter((r) => !(r.metodo === 'POST' && r.caminho === '/users')),
      ...rotasDoController(UsersControllerAdulterado),
    ];

    expect(() => auditarRotas(rotasAdulteradas, ROTAS_REVISADAS)).toThrow(
      /Rota "POST \/users" mudou de nível de exigência \(esperado "roles:ADMIN", encontrado "anyAuthenticated"\)/,
    );
  });

  it('detecta decorators conflitantes (@Public() + @Roles() na mesma rota ou classe)', () => {
    @Controller('conflito')
    class ControllerConflitante {
      @Public()
      @Roles(UserRole.ADMIN)
      @Get()
      rotaAmbigua(): void {}
    }

    const rotasComConflito = [...rotasReais, ...rotasDoController(ControllerConflitante)];

    expect(() => auditarRotas(rotasComConflito, ROTAS_REVISADAS)).toThrow(
      /Rota "GET \/conflito" declara @Public\(\) e @Roles\(\) simultaneamente/,
    );
  });
});
