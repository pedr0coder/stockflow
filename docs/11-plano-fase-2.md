# 11 — Plano de Execução da Fase 2 (Fundação)

> Objetivo da fase: **tudo instalado, configurado e executando de ponta a ponta, sem
> nenhuma funcionalidade de negócio.** Se esta fase terminar bem, qualquer pessoa clona o
> repositório, roda um comando e tem o sistema no ar, vazio mas vivo.

## 11.1 O que a Fase 2 não faz

Deixar isso explícito evita escopo vazando para dentro da fundação:

| Fora da Fase 2                                       | Fase em que entra |
| ---------------------------------------------------- | ----------------- |
| Login, JWT, guards, RBAC                             | Fase 4            |
| CRUD de produtos, categorias, fornecedores, usuários | Fase 4            |
| Movimentação de estoque, inventário, relatórios      | Fase 5            |
| Design system, `AppShell`, `DataTable`, telas        | Fase 3            |
| Dockerfile de produção multi-stage                   | Fase 8            |

O que entra é a **estrutura** onde tudo isso vai morar, mais os dois pontos que não dão
para deixar para depois: o `schema.prisma` completo (porque a primeira migration define o
banco inteiro) e o contrato de erro (porque todo módulo posterior depende dele).

## 11.2 Ordem de implementação

A ordem segue dependência técnica, não preferência. Cada passo só começa depois que o
anterior roda.

### Bloco A — Raiz do repositório

| #   | Arquivo                           | Conteúdo                                                            |
| --- | --------------------------------- | ------------------------------------------------------------------- |
| A1  | `.gitignore`                      | `node_modules`, `dist`, `.env`, `coverage`, artefatos do Playwright |
| A2  | `.nvmrc`                          | `24.15.0`                                                           |
| A3  | `.editorconfig`                   | LF, UTF-8, 2 espaços                                                |
| A4  | `.env.example`                    | todas as chaves, **nenhum valor real**                              |
| A5  | `.prettierrc` / `.prettierignore` | formatação única nos dois pacotes                                   |
| A6  | `package.json` (raiz)             | apenas Husky, lint-staged e commitlint. **Sem workspaces** (§2.7)   |
| A7  | `commitlint.config.js`            | Conventional Commits                                                |

A raiz tem um `package.json` mesmo sem workspaces porque hook de commit é por repositório,
não por pacote. Ele não declara dependência de aplicação.

### Bloco B — Backend: base compilável

| #   | Arquivo                                         | Nota                                                              |
| --- | ----------------------------------------------- | ----------------------------------------------------------------- |
| B1  | `backend/package.json`                          | versões da §3.3, `prisma` e `@prisma/client` **exatos**           |
| B2  | `backend/tsconfig.json` + `tsconfig.build.json` | `experimentalDecorators`, `emitDecoratorMetadata`, `strict: true` |
| B3  | `backend/nest-cli.json`                         |                                                                   |
| B4  | `npm install`                                   | verificar que roda **sem** `--legacy-peer-deps`                   |

### Bloco C — Banco de dados

| #   | Arquivo                                                     | Nota                                                                |
| --- | ----------------------------------------------------------- | ------------------------------------------------------------------- |
| C1  | `backend/prisma/schema.prisma`                              | modelo **completo** da §04: 8 tabelas, 4 enums, índices             |
| C2  | `backend/prisma/migrations/<ts>_init/migration.sql`         | gerada por `prisma migrate dev`                                     |
| C3  | migration SQL adicional                                     | `CREATE EXTENSION pg_trgm`, índice GIN trigram e os 5 CHECK da §4.4 |
| C4  | `backend/src/prisma/prisma.service.ts` + `prisma.module.ts` | `onModuleInit`/`onModuleDestroy`                                    |

O schema completo entra agora de propósito: a primeira migration é a que cria o banco, e
fatiá-la em oito migrations ao longo das fases produziria um histórico de migração que
conta a história do desenvolvimento em vez de descrever o esquema.

Os CHECK e o índice trigram vão em SQL escrito à mão dentro da migration, porque o Prisma
não os declara no schema. Isso é esperado e está registrado na §4.4.

### Bloco D — Backend: transversal

| #   | Arquivo                                       | Nota                                                                                |
| --- | --------------------------------------------- | ----------------------------------------------------------------------------------- |
| D1  | `src/config/env.validation.ts`                | schema de ambiente com class-validator (ADR-0002)                                   |
| D2  | `src/common/errors/error-codes.ts`            | enum dos `code` estáveis da §5.1                                                    |
| D3  | `src/common/errors/domain-error.ts`           | base dos erros de negócio, com `code` e `status`                                    |
| D4  | `src/common/filters/all-exceptions.filter.ts` | contrato único de erro da §2.6                                                      |
| D5  | `src/common/interceptors/request-id`          | `requestId` na resposta de erro e no log                                            |
| D6  | `src/health/`                                 | `GET /health` (liveness) e `GET /health/ready` (ping no banco)                      |
| D7  | `src/app.module.ts`                           | composição dos módulos                                                              |
| D8  | `src/main.ts`                                 | prefixo `/api/v1`, Helmet, CORS com allowlist, ValidationPipe global, Swagger, Pino |

`/health/ready` consulta o banco com `SELECT 1`. Se consultasse apenas a si mesma,
responderia 200 com o Postgres caído, o que é pior que não ter health check.

O `ValidationPipe` global já nasce com `whitelist`, `forbidNonWhitelisted` e `transform`
(§8.4). Ligar isso depois, com DTOs já escritos, costuma revelar campos que passavam sem
declaração.

### Bloco E — Backend: testes reais

| #   | Arquivo                                            | Tipo       | Casos                                                                                       |
| --- | -------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------- |
| E1  | `vitest.config.ts`                                 | config     | unitários, com `unplugin-swc` (§3.5.1)                                                      |
| E2  | `vitest.config.int.ts`                             | config     | integração, sequencial, Postgres real                                                       |
| E3  | `src/config/env.validation.spec.ts`                | unitário   | falta de `DATABASE_URL`, segredo curto, segredos iguais, `PORT` inválida, caso válido       |
| E4  | `src/common/filters/all-exceptions.filter.spec.ts` | unitário   | erro de domínio vira o `code` certo; 500 não vaza stack; 400 de validação preserva detalhes |
| E5  | `test/health.int-spec.ts`                          | integração | `/health` 200; `/health/ready` 200 com banco; rota inexistente 404 no contrato de erro      |

E3 e E4 são escolhidos por serem exatamente o que a §7.1 manda cobrir: código que, se
quebrar, deixa passar config inválida ou vaza detalhe interno. Não há teste de getter nesta
fase porque não há getter.

### Bloco F — Backend: qualidade e seed

| #   | Arquivo                     | Nota                                                            |
| --- | --------------------------- | --------------------------------------------------------------- |
| F1  | `backend/eslint.config.mjs` | ESLint 10 flat config + typescript-eslint type-aware            |
| F2  | `backend/prisma/seed.ts`    | usuários, categorias, fornecedores, produtos com **saldo zero** |

**Limitação assumida no seed:** a §4.7 prevê que o histórico de movimentações seja gerado
pelo mesmo service de produção. Esse service só existe na Fase 5. Então o seed da Fase 2
cria cadastro e **nenhuma movimentação**, e os produtos nascem com saldo 0. A alternativa
seria inserir movimentações por `INSERT` direto, o que produziria exatamente o estado que a
regra de negócio poderia recusar. O seed é completado na Fase 5.

### Bloco G — Frontend

| #   | Arquivo                                                 | Nota                                                              |
| --- | ------------------------------------------------------- | ----------------------------------------------------------------- |
| G1  | `frontend/package.json` + `tsconfig` + `vite.config.ts` | versões da §3.4                                                   |
| G2  | `frontend/src/index.css`                                | Tailwind 4 com `@theme`, tokens da §6.4                           |
| G3  | `components.json` + `src/lib/utils.ts`                  | shadcn/ui inicializado, alias `@/`                                |
| G4  | `src/App.tsx`                                           | tela única que consulta `/health/ready` e mostra o resultado real |
| G5  | `src/App.test.tsx`                                      | teste de componente: loading, sucesso e erro                      |
| G6  | `frontend/eslint.config.js`                             | ESLint 10 flat + react-hooks                                      |

G4 é deliberadamente feio e pequeno. A Fase 2 não tem design system ainda, e inventar uma
tela bonita agora significaria refazê-la na Fase 3. O que ela precisa provar é que o
frontend compila, sobe, fala com a API pelo proxy e **exibe o estado real da requisição**,
inclusive quando falha.

### Bloco H — Infraestrutura

| #   | Arquivo                                              | Nota                                                           |
| --- | ---------------------------------------------------- | -------------------------------------------------------------- |
| H1  | `backend/Dockerfile.dev` / `frontend/Dockerfile.dev` | imagem de desenvolvimento                                      |
| H2  | `docker-compose.yml`                                 | `db`, `backend`, `frontend`                                    |
| H3  | `.github/workflows/ci.yml`                           | lint, typecheck, test, test:int com Postgres de serviço, build |
| H4  | `README.md`                                          | reescrito com o estado real                                    |

**Decisão sobre o `node_modules` no Compose:** as dependências são instaladas **dentro** da
imagem e o `node_modules` do container fica em volume anônimo, por cima do bind mount do
código. Sem isso, o `node_modules` do Windows seria montado no container Linux e o binário
pré-compilado do `@node-rs/argon2` (plataforma `win32-x64`) não carregaria em `linux-x64`.
É um problema concreto, não teórico, e é consequência direta do ADR-0004.

**Dois modos de execução, ambos documentados:**

| Modo     | Comando                                                    | Para que serve                                                                      |
| -------- | ---------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Completo | `docker compose up`                                        | o `git clone && docker compose up` do portfólio, e o que o critério de aceite exige |
| Híbrido  | `docker compose up -d db` e `npm run dev` nos dois pacotes | desenvolvimento diário: HMR rápido e depurador do editor funcionando                |

O modo híbrido existe porque bind mount do Windows para o WSL2 é lento, e porque atachar
depurador a processo em container é atrito desnecessário no dia a dia. O modo completo
existe porque é ele que torna o repositório executável por um terceiro, e porque um
`docker-compose.yml` que nunca foi executado é documentação falsa.

O banco cria **dois** databases no boot: `stockflow` e `stockflow_test` (§7.7), por script
em `docker-entrypoint-initdb.d`. Banco de teste separado impede que a suíte de integração,
que trunca tabelas, apague dados de desenvolvimento.

## 11.3 Critério de aceite da fase

Nenhum item é marcado sem saída de comando registrada no relatório final.

- [ ] `npm install` nos dois pacotes sem `--legacy-peer-deps` e sem erro de peer
- [ ] `prisma migrate deploy` aplica em banco **vazio** (testado em database descartável)
- [ ] `npm run lint` limpo nos dois pacotes
- [ ] `npm run typecheck` (`tsc --noEmit`) sem erro nos dois pacotes
- [ ] `npm run test` passa nos dois pacotes, com testes de verdade
- [ ] `npm run test:int` passa contra Postgres real
- [ ] `npm run build` gera `dist` nos dois pacotes
- [ ] `docker compose up` sobe os três serviços
- [ ] `GET /api/v1/health/ready` responde 200 com o banco de pé
- [ ] `GET /api/v1/health/ready` responde 503 com o banco derrubado (prova que não é fixo)
- [ ] Swagger acessível em `/api/docs`
- [ ] Frontend carrega e exibe o estado real da API
- [ ] CI definido e com os mesmos comandos que rodam localmente
- [ ] `.env` ausente do que seria commitado; `.env.example` sem valor real
- [ ] README descreve o estado real, sem funcionalidade aspiracional

O item do 503 é o que diferencia health check de enfeite: um endpoint que sempre responde
200 não informa nada.

## 11.4 O que pode dar errado nesta fase

Riscos específicos da Fase 2, levantados antes de começar:

| Risco                                            | Mitigação                                                                        |
| ------------------------------------------------ | -------------------------------------------------------------------------------- |
| `npm install` puxa `prisma@8.0.0-rc`             | versão exata no `package.json`, verificada no lock após instalar                 |
| Vitest não resolve DI do NestJS                  | `unplugin-swc` já previsto (§3.5.1); o teste de integração é a prova             |
| Binário do `@node-rs/argon2` errado no container | `node_modules` em volume anônimo (H2)                                            |
| Migration do Prisma não inclui CHECK nem trigram | SQL escrito à mão na migration e conferido com `\d+` no banco                    |
| Tailwind 4 configurado como se fosse v3          | sem `tailwind.config.js`; tokens em `@theme` no CSS e plugin `@tailwindcss/vite` |
| CI verde localmente e vermelho no runner         | CI roda exatamente os mesmos scripts do `package.json`, sem comando próprio      |

## 11.5 Commits previstos

Nenhum commit será feito sem autorização. Quando houver, a sequência proposta é esta, em
Conventional Commits, para que o histórico descreva a construção e não um despejo único:

```
chore: initialize repository structure and tooling
chore(backend): scaffold NestJS application
feat(backend): add complete prisma schema and initial migration
feat(backend): add environment validation and error contract
feat(backend): add health check endpoints
test(backend): add unit and integration test setup
chore(frontend): scaffold vite react application
feat(frontend): add theme tokens and api health screen
chore: add docker compose and development images
ci: add github actions pipeline
docs: update readme with phase 2 state
```
