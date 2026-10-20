# 12 — Relatório da Fase 2 (Fundação)

**Data:** 2026-10-17 · **Status:** concluída, aguardando aprovação para a Fase 3

> Nenhum resultado abaixo foi escrito sem execução. Onde há saída de comando, ela é a
> saída real. Onde algo não foi verificado, está dito que não foi.

## 12.1 Validação do ambiente

O ambiente foi reverificado por comando, sem partir do relato. Resultados em
[01-diagnostico.md](01-diagnostico.md).

| Item             | Verificado                                       |
| ---------------- | ------------------------------------------------ |
| Docker Engine    | 29.8.2 (build 7fc2dff)                           |
| Docker Compose   | v5.6.0                                           |
| WSL2             | Ubuntu, versão 2, em execução                    |
| Virtualização    | `HypervisorPresent = True`                       |
| PostgreSQL       | 17.11, por `SELECT version()` em container       |
| Recursos do WSL2 | 6 CPUs e 7,76 GiB, confirmados via `docker info` |
| Node / npm / Git | 24.15.0 / 11.12.1 / 2.55.0                       |
| Compilador C++   | **ausente** (bloqueio da §1.3 continua válido)   |

Duas verificações foram além do relato, porque a Fase 5 depende delas:

- **`pg_trgm` disponível** (1.6) e criada com sucesso. É o que torna possível o índice GIN
  trigram de `products.name`.
- **Primitiva do ADR-0003 validada em SQL.** Em uma tabela `numeric(14,3)` com CHECK, o
  UPDATE condicional devolveu 1 linha com saldo suficiente, 0 linhas sem saldo, e o CHECK
  recusou a escrita quando a guarda foi removida. As três camadas de defesa se comportam
  como o desenho supõe neste PostgreSQL.

**R1 (banco local ausente) está resolvido** e marcado como tal em
[10-riscos.md](10-riscos.md). Nenhum risco bloqueante permanece aberto.

## 12.2 Consistência com as decisões da Fase 1

Todas as versões foram reconsultadas no registro npm. As três armadilhas da §3.1
continuam ativas, incluindo `prisma@latest` apontando para `8.0.0-rc.23`.

Seis ajustes entraram, todos documentados no lugar certo. Nenhuma decisão arquitetural foi
alterada.

| #   | Mudança                                 | Por quê                                                                                                                                                                               |
| --- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | ESLint **10.13.0** em vez de 9          | `eslint@latest` é 10; typescript-eslint 8.71.2 declara suporte a `^10.0.0` e a `typescript <6.1.0`. Flat config continua sendo o formato.                                             |
| 2   | `unplugin-swc` + `@swc/core` no backend | O esbuild do Vitest não implementa `emitDecoratorMetadata`, e sem ele a injeção de dependência do NestJS não funciona em teste. Registrado como Armadilha 4 na [§3.5.1](03-stack.md). |
| 3   | `uuid@14.0.3`                           | A §4.2 pede UUIDv7 gerado na aplicação, e `crypto.randomUUID()` do Node 24 só produz v4. Faltava a dependência no plano.                                                              |
| 4   | `pino-http@11` explícito                | É peer declarado do `nestjs-pino` e precisa ser instalado por nome.                                                                                                                   |
| 5   | `@prisma/adapter-pg`                    | O Prisma 7 não embute mais o query engine: o acesso ao banco exige um driver adapter explícito.                                                                                       |
| 6   | `dotenv`                                | O Prisma 7 deixou de carregar `.env` sozinho.                                                                                                                                         |

Mudanças de forma trazidas pelo Prisma 7, descobertas na implementação:

- a configuração do CLI mora em **`prisma7.config.ts`**, não mais no `schema.prisma` nem
  na chave `prisma` do `package.json`;
- a URL do banco saiu do `datasource` e passou para esse arquivo;
- o generator padrão é `prisma-client`, que emite **arquivos `.ts` em uma pasta do projeto**
  (`src/generated/prisma`), e não mais dentro de `node_modules`. O cliente passa a ser
  artefato de build e está no `.gitignore`, o que torna `prisma generate` um passo
  obrigatório do CI.

## 12.3 O que foi implementado

### Raiz

`package.json` (apenas Husky, lint-staged e commitlint, sem workspaces), `.gitignore`,
`.gitattributes`, `.env.example`, `.editorconfig`, `.prettierrc`, `.prettierignore`,
`commitlint.config.js`, `docker-compose.yml`, `.github/workflows/ci.yml` e o script de
init do Postgres.

Repositório Git inicializado em `main`. **Nenhum commit foi feito**, conforme autorização
pendente.

### Backend

| Área      | Entregue                                                                                                                                                |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Base      | NestJS 12, TypeScript 6.0.3, prefixo `/api/v1`, build por `nest build`                                                                                  |
| Ambiente  | Validação no boot com class-validator: segredo curto, segredos iguais, `CORS_ORIGINS` com `*`, `PORT` fora de faixa e campo ausente derrubam o processo |
| Banco     | `schema.prisma` completo: 9 tabelas, 5 enums, índices da §4.4; migration inicial com o SQL escrito à mão                                                |
| Prisma    | `PrismaService` com pool limitado a 10 e timeout de 10 s, mais `ping()` para o readiness                                                                |
| Erros     | `ErrorCode`, `DomainError`, `AllExceptionsFilter` global e handler de 404 fora do roteador                                                              |
| Log       | Pino com `requestId` UUIDv7, redação de 11 caminhos sensíveis e `x-request-id` na resposta                                                              |
| Segurança | Helmet com CSP própria, CORS com allowlist, `x-powered-by` desabilitado, ValidationPipe global com `whitelist` e `forbidNonWhitelisted`                 |
| Health    | `GET /health` (liveness) e `GET /health/ready` (consulta o banco)                                                                                       |
| Docs      | Swagger em `/api/docs`, gerado dos DTOs                                                                                                                 |
| Seed      | 3 usuários, 7 categorias, 5 fornecedores, 42 produtos, idempotente                                                                                      |

### Frontend

Vite 8 com React 19 e TypeScript 6.0.3; Tailwind 4 como plugin do Vite, com os tokens do
design system em `@theme`; shadcn/ui inicializado (`components.json` e `cn()`); uma tela
que consulta `/health/ready` e exibe o estado real, com carregamento, sucesso, banco fora
do ar, erro de rede e botão de nova tentativa.

Não há `tailwind.config.js` nem `postcss.config.js`, e isso é intencional: a v4 é
CSS-first.

### Infraestrutura

`Dockerfile.dev` nos dois pacotes, `docker-compose.yml` com `db`, `backend` e `frontend`,
healthcheck no banco, dois bancos criados no boot (`stockflow` e `stockflow_test`) e
`node_modules` em volume anônimo.

CI com quatro jobs: verificação de segredos, backend (com serviço Postgres), frontend e
formatação.

## 12.4 Defeitos encontrados e corrigidos

Cinco problemas reais apareceram durante a implementação. Nenhum foi contornado.

**1. Cliente do Prisma em ESM dentro de um pacote CommonJS.** O generator `prisma-client`
emite `import.meta.url`. O Node 24 detecta `import.meta` em um `.js` e carrega o arquivo
como módulo ES, o que derruba o boot com `ReferenceError: exports is not defined in ES
module scope`. Foi o **container** que expôs isso. Corrigido na origem com
`moduleFormat = "cjs"` no generator, e não com contorno de interoperabilidade.

**2. `path` do erro vinha sem o prefixo.** O prefixo global monta um sub-router, e dentro
dele `req.url` já chega sem `/api/v1`. O filtro passou a usar `originalUrl`.

**3. Mensagem de 404 em inglês, vinda do framework.** `Cannot GET /x` vazava a forma do
Nest e contrariava o contrato, que diz que `message` é texto para o usuário final em
português. O filtro passou a reconhecer esse padrão e usar o texto padrão do status.

**4. Caminho fora do prefixo escapava do contrato de erro.** `GET /health` caía no handler
padrão do Express e devolvia **HTML**. A promessa de "uma só forma de erro" era falsa
justamente no erro mais comum de quem integra: errar a URL. Resolvido com um handler de
404 registrado depois de `app.init()`.

**5. `setState` síncrono dentro de `useEffect`.** Apontado pelas regras novas do
`eslint-plugin-react-hooks`: causa renderização em cascata. O estado de carregamento passou
a ser o valor inicial do `useState`, e o retry define o estado no próprio handler do clique.

Três ajustes de ferramental também foram necessários: o TypeScript 6 deprecou
`moduleResolution: node10` e `baseUrl` e passou a exigir `rootDir` explícito; a suíte de
integração não tinha como aplicar as próprias migrations; e o ESLint 10 apontou um `throw`
sem `cause` preservado.

## 12.5 Testes executados

Saída real dos comandos, nesta máquina, em 2026-10-17.

```
$ npm --prefix backend run test
 Test Files  2 passed (2)
      Tests  28 passed (28)
   Duration  592ms

$ npm --prefix backend run test:int
 Test Files  1 passed (1)
      Tests  17 passed (17)
   Duration  2.64s

$ npm --prefix frontend run test
 Test Files  1 passed (1)
      Tests  8 passed (8)
   Duration  1.40s
```

**53 testes, todos passando.** Nenhum marcado como `skip`.

| Suíte                           | Casos | O que cobre                                                                                                                                                                                                                                                                                                |
| ------------------------------- | ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `env.validation.spec.ts`        | 14    | Segredo curto, segredos iguais, `CORS_ORIGINS` com `*` (isolado e misturado), `NODE_ENV` inválido, `PORT` fora de faixa e não numérica, relato de todos os problemas de uma vez, e **assertiva de que o valor do segredo não aparece na mensagem de erro**                                                 |
| `all-exceptions.filter.spec.ts` | 14    | Erro de domínio com `code`, status e `details` próprios; 500 com mensagem genérica; **nenhum vazamento de stack, nome de tabela ou host**; 4xx como `warn` e 5xx como `error`; array do ValidationPipe indo para `details`; 404 do framework traduzido; campos do contrato; `requestId` propagado e gerado |
| `health.int-spec.ts`            | 17    | App Nest real contra PostgreSQL real: conexão, 9 tabelas aplicadas, **os 5 CHECK constraints**, o índice GIN trigram, `numeric(14,3)` em vez de float, os dois health checks, cabeçalhos do Helmet, `x-request-id`, contrato de erro por HTTP e o documento OpenAPI                                        |
| `App.test.tsx`                  | 8     | Carregamento, sucesso, **banco fora do ar sem fingir sucesso**, erro de rede, formato inesperado, nova tentativa, e a frase que declara que não há funcionalidade de negócio                                                                                                                               |

O teste de integração tem valor além do que ele afirma: é a prova de que a injeção de
dependência do NestJS funciona sob o Vitest. Sem o `unplugin-swc` da §3.5.1, ele falharia
inteiro.

Verificações de banco não cobertas por teste automatizado (consulta direta ao catálogo):
decimais com escala correta em todas as 8 colunas numéricas, ids em UUIDv7, hash Argon2id
com `m=19456,t=2,p=1`.

## 12.6 Critério de aceite

| Critério                                                      | Resultado                                                                                                           |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `npm install` sem `--legacy-peer-deps`                        | Nos três pacotes, **0 vulnerabilidades**                                                                            |
| Versões críticas fixadas                                      | `prisma` e `@prisma/client` em **7.10.1** (não o RC 8), `typescript` em **6.0.3**, conferido no `package-lock.json` |
| Migration aplica em banco vazio                               | Sim, após `docker compose down --volumes`, pelo entrypoint no boot                                                  |
| Lint limpo nos dois pacotes                                   | Sim                                                                                                                 |
| `tsc --noEmit` sem erro e sem supressão                       | Sim, nos dois pacotes                                                                                               |
| `npm run test` nos dois lados                                 | 28 + 8 passando                                                                                                     |
| `npm run test:int` contra Postgres real                       | 17 passando                                                                                                         |
| `npm run build` nos dois pacotes                              | Sim                                                                                                                 |
| `docker compose up` sobe os três serviços                     | Sim, do zero, com volume recriado                                                                                   |
| `/api/v1/health/ready` responde 200                           | Sim                                                                                                                 |
| `/api/v1/health/ready` responde **503** com o banco derrubado | Sim, e volta a 200 quando o banco retorna, **sem reiniciar a API**                                                  |
| Swagger em `/api/docs`                                        | 200, com os endpoints e os schemas dos DTOs                                                                         |
| Frontend carrega e mostra o estado real                       | Sim, verificado no navegador nos dois estados                                                                       |
| `.env` fora do que seria commitado                            | Sim, e nenhum segredo do `.env` aparece em arquivo versionável                                                      |
| `.env.example` sem valor real                                 | Sim                                                                                                                 |
| CI com os mesmos comandos do `package.json`                   | Sim                                                                                                                 |
| **CI verde no runner do GitHub**                              | **Sim, na execução #2, nos quatro jobs** (§12.8)                                                                    |
| README descreve o estado real                                 | Sim                                                                                                                 |

Os 83 arquivos que entrariam no commit foram listados e revisados um a um. Não há
`node_modules`, `dist`, cliente gerado, `.env` nem configuração de ferramenta de
desenvolvimento.

## 12.7 Limitações desta entrega

Ditas aqui e repetidas no README, para que não passem como resolvidas.

1. **Nenhuma funcionalidade de negócio existe.** Autenticação, cadastros, movimentação e
   inventário são das Fases 4 e 5.
2. **O seed não cria movimentações.** Todos os 42 produtos ficam com saldo zero. Criar
   histórico por `INSERT` direto produziria exatamente o estado que a regra de negócio
   recusaria. O seed é completado na Fase 5.
3. **Os `Dockerfile.dev` não são imagem de produção.** Rodam como root e carregam
   devDependencies. A imagem multi-stage é da Fase 8.
4. **O rate limiting não está configurado.** O `@nestjs/throttler` está instalado, mas ele
   protege endpoints de autenticação, que não existem ainda.
5. **Nenhum teste E2E.** Playwright é da Fase 7, quando houver fluxo a percorrer.

A limitação sobre o CI saiu desta lista: a segunda execução passou nos quatro jobs. O
histórico das duas execuções está em §12.8.

## 12.8 Primeira execução do CI

O pipeline foi executado pela primeira vez no push inicial para o repositório remoto.

### Resultado

| Job        | Resultado            |
| ---------- | -------------------- |
| Segredos   | Passou               |
| Backend    | Passou               |
| Formatação | Passou               |
| Frontend   | **Reprovou no lint** |

Os passos de typecheck, teste e build do frontend não chegaram a executar, porque o lint
veio antes e falhou.

```
frontend/vite.config.ts
  21:7   error  Unsafe assignment of an error typed value       @typescript-eslint/no-unsafe-assignment
  21:12  error  Unsafe call of a type that could not be resolved @typescript-eslint/no-unsafe-call
  46:9   error  Unsafe assignment of an error typed value        @typescript-eslint/no-unsafe-assignment
  46:25  error  Unsafe member access .env on a type that cannot be resolved  @typescript-eslint/no-unsafe-member-access
```

### Causa raiz

As duas linhas apontadas usam API do Node: a 21 chama `fileURLToPath` e a 46 lê
`process.env`. O pacote `frontend` **usava essas APIs sem declarar `@types/node`**.

O Vite declara `@types/node` como peer dependency **opcional**, e o npm não instala peer
opcional. Mesmo assim o tipo chegava, por um caminho indireto: o
`vite/dist/node/index.d.ts` traz um `/// <reference types="node" />`, e o TypeScript
resolve essa referência subindo de diretório em diretório à procura de
`node_modules/@types/node`.

Na máquina de desenvolvimento ele encontrava um nível acima, no `node_modules` da **raiz
do repositório**, onde o `@types/node` existe como dependência transitiva do Husky e do
commitlint. No runner, o job do frontend roda `npm ci` apenas dentro de `frontend/`, e o
`node_modules` da raiz nunca é criado: a busca sobe até a raiz do disco e falha. Sem o
tipo, `fileURLToPath` e `process` passam a ter tipo não resolvido, e as quatro regras
disparam.

Ou seja, não é diferença entre Windows e Linux. É diferença de layout de diretório entre
a máquina de desenvolvimento e o job isolado, e o defeito real é um pacote que dependia de
um tipo que ele não declarava.

**Achado adicional:** o typecheck também falharia, com `TS2591` nas mesmas duas linhas. O
lint apenas chegou primeiro. A falha era maior do que o job conseguiu mostrar.

### Reprodução

O `HEAD` foi exportado para um diretório limpo, sem nenhum `node_modules`, e o comando do
CI foi executado ali. Os quatro erros reapareceram nas mesmas linhas e colunas, o que
confirma a causa antes de qualquer alteração.

### Correção

Nenhuma regra desativada, nenhum `any`, nenhuma supressão.

1. **`@types/node@~24.19.2` declarado no `frontend`**, na mesma versão do backend e do
   runtime. Tipar API do Node 26 enquanto se executa Node 24 deixaria compilar código que
   quebra em execução.
2. **`tsconfig` separado em dois projetos.** Instalar o pacote resolveria o CI, mas criaria
   um problema novo: `process.env` passaria a compilar dentro de um componente React e
   falharia no navegador. `tsconfig.app.json` cobre `src/` com `types: ["vite/client"]`, e
   `tsconfig.node.json` cobre `vite.config.ts` com `types: ["node"]`. O `tsconfig.json`
   virou arquivo de solução com as duas referências, e os scripts passaram a usar
   `tsc -b --noEmit`.

Teste negativo confirmando a garantia, já com `@types/node` instalado no pacote: um arquivo
em `src/` que usa `process.env` ou `node:url` falha a compilação com `TS2591`.

Nenhum arquivo de código-fonte foi alterado. O `vite.config.ts` permanece idêntico e o
bundle saiu com os mesmos hashes, o que confirma que só a resolução de tipos mudou.

### Confirmação: execução #2

O job completo do frontend foi reproduzido em diretório limpo, com `npm ci` apenas em
`frontend/`, e os quatro passos passaram. Mas reprodução local não é confirmação, então a
correção só foi dada como válida depois do runner.

A execução **#2**, no commit `766f937`, passou nos quatro jobs.

| Execução | Commit    | Resultado                    |
| -------- | --------- | ---------------------------- |
| #1       | `683641d` | Reprovou no lint do frontend |
| #2       | `766f937` | **Passou nos quatro jobs**   |

O pipeline está verde e a limitação correspondente saiu da §12.7.

### O que esta falha ensinou

Vale registrar porque o padrão se repete em qualquer monorepo com pacotes independentes.

Um pacote que usa uma API precisa **declarar** os tipos dela. Enquanto o `node_modules` da
raiz existia na máquina de desenvolvimento, a dependência não declarada era resolvida por
acidente de layout de diretório, e tudo passava. O job isolado do CI não tem esse acidente,
e foi ele que expôs o defeito.

Ou seja, o pipeline fez exatamente o que deveria: reprovou um estado que parecia correto
localmente. Verde local e verde no runner só significam a mesma coisa quando o pacote é
autossuficiente.

## 12.9 Próxima etapa

**Fase 3 — Design System e Shell**, conforme [09-roadmap.md](09-roadmap.md): tokens
aplicados em componentes, `AppShell` com sidebar colapsável e header, componentes
compartilhados (`PageHeader`, `DataTable`, `StatCard`, `StockBadge`, `ConfirmDialog`,
`EmptyState`, `ErrorState`, `FormField`), tela de login visual, dashboard com skeletons e
sem número inventado, React Router com rotas protegidas, responsividade nas três faixas e
testes de componente do `DataTable` e do `ConfirmDialog`.

Entra também, por serem as dependências que a fase justifica: React Router 8, TanStack
Query 5, React Hook Form e Zod 4.

**Aguardando autorização para iniciar.** Os commits da Fase 2 também aguardam autorização:
a sequência proposta está em [11-plano-fase-2.md §11.5](11-plano-fase-2.md).
