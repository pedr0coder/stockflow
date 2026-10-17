# 03 — Stack Definitiva

> Todas as versões abaixo foram consultadas no registro npm em 2026-10-17
> (`npm view <pkg> version`), não presumidas de memória.
> Regra aplicada: **nenhuma dependência entra sem justificativa.**
>
> **Revalidadas antes da Fase 2**, no mesmo dia. As três armadilhas da §3.1 continuam
> ativas, incluindo `prisma@latest` apontando para `8.0.0-rc.23`. Duas correções entraram
> nesta revisão: ESLint 10 em vez de 9 (§3.6) e `unplugin-swc` no backend (§3.5.1).
> `lucide-react` passou de 1.58.0 para **1.59.0** no intervalo, sem efeito sobre o resto.

## 3.1 Armadilhas encontradas na verificação

A verificação de versões revelou três problemas que teriam quebrado o projeto se a stack
tivesse sido montada com `@latest`. Estes três pontos são, por si, bom material de
entrevista.

### Armadilha 1 — `prisma@latest` instala um release candidate

```
npm view prisma dist-tags
{ "latest": "8.0.0-rc.23", "prev": "7.10.1", "next": "8.0.0-rc.10", ... }

npm view @prisma/client version
7.10.1
```

A tag `latest` do pacote `prisma` aponta para um **RC**, enquanto `@prisma/client` aponta
para a estável `7.10.1`. Um `npm install prisma @prisma/client` instalaria CLI 8-rc com
client 7 — versões desalinhadas.

**Decisão:** fixar `prisma@7.10.1` e `@prisma/client@7.10.1`, ambos exatos.

### Armadilha 2 — TypeScript 7 é incompatível com o ecossistema NestJS

```
npm view typescript dist-tags        -> latest: 7.0.2
npm view @nestjs/cli dependencies.typescript -> ~6.0.2
npm view @nestjs/swagger peerDependencies.typescript -> ^5.5.0 || ^6.0.0
```

`@nestjs/swagger@12.0.2` **não declara suporte a TypeScript 7**, e o próprio
`@nestjs/cli@12.0.8` depende de `typescript ~6.0.2`. O TypeScript 7 (porte nativo em Go)
também não expõe a Compiler API programática, da qual o `nest build` depende.

**Decisão:** TypeScript **6.0.3** em backend e frontend. Ver
[ADR-0001](adr/0001-versao-typescript.md).

### Armadilha 3 — `nestjs-zod` não suporta NestJS 12

```
npm view nestjs-zod peerDependencies
{ "@nestjs/common": "^10.0.0 || ^11.0.0",
  "@nestjs/swagger": "^7.4.2 || ^8.0.0 || ^11.0.0", ... }
```

A versão atual (5.5.0) para em NestJS 11. Usá-la exigiria `--legacy-peer-deps`, o que é
dívida técnica disfarçada.

**Decisão:** `class-validator` + `class-transformer` no backend (integração oficial com
`@nestjs/swagger`), e **Zod no frontend**, onde ele é de fato necessário pelo React Hook
Form. Ver [ADR-0002](adr/0002-validacao-backend.md).

## 3.2 Compatibilidade com o Node 24.15.0 instalado

| Pacote                | `engines.node` declarado              | Node 24.15 atende? |
| --------------------- | ------------------------------------- | ------------------ |
| `@nestjs/core@12.1.3` | `>= 20`                               | Sim                |
| `prisma@7.10.1`       | `^20.19 \|\| ^22.12 \|\| >=24.0`      | Sim                |
| `vite@8.3.4`          | `^20.19.0 \|\| >=22.12.0`             | Sim                |
| `vitest@5.0.5`        | `^22.12.0 \|\| ^24.0.0 \|\| >=26.0.0` | Sim                |

Nenhum conflito de runtime. O projeto fixará a versão em `.nvmrc` e em
`engines` do `package.json` para que o CI use o mesmo Node.

### Peers do ecossistema NestJS verificados antes de instalar

Checagem feita pacote por pacote, para que `npm install` não precise de
`--legacy-peer-deps` em nenhum momento:

| Pacote                    | `peerDependencies` relevante                                        | NestJS 12 atende?           |
| ------------------------- | ------------------------------------------------------------------- | --------------------------- |
| `nestjs-pino@5.3.1`       | `@nestjs/core: ^11.0.8 \|\| ^12.0.2`, `pino: ^10`, `pino-http: ^11` | Sim                         |
| `@nestjs/swagger@12.0.2`  | `@nestjs/core: ^12.0.0`, `typescript: ^5.5 \|\| ^6.0`               | Sim (e confirma o ADR-0001) |
| `@nestjs/passport@12.0.0` | `@nestjs/common: ^11 \|\| ^12`, `passport: ^0.5–0.7`                | Sim (`passport@0.7.0`)      |
| `@nestjs/throttler@6.7.1` | `@nestjs/core: ^7 … ^12`                                            | Sim                         |
| `@nestjs/jwt@12.0.3`      | `@nestjs/common: ^8 … ^12`                                          | Sim                         |
| `@nestjs/config@12.0.1`   | `@nestjs/common: ^11 \|\| ^12`, `rxjs: ^7.1`                        | Sim                         |

O peer `typescript: ^5.5.0 || ^6.0.0` do `@nestjs/swagger` é a confirmação direta, no
registro, do que o [ADR-0001](adr/0001-versao-typescript.md) decidiu: TS 7 ficaria fora da
faixa declarada.

## 3.3 Backend

| Pacote                               | Versão                  | Por que está aqui                                                                                                                                                                                                                                   |
| ------------------------------------ | ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@nestjs/core`, `@nestjs/common`     | 12.1.3                  | Framework. Modularidade e DI por decorators dão estrutura de domínio sem precisar inventá-la.                                                                                                                                                       |
| `@nestjs/platform-express`           | 12.1.3                  | Adapter HTTP. Express por maturidade de middleware; Fastify não traz ganho relevante nesta escala.                                                                                                                                                  |
| `@nestjs/config`                     | 12.0.1                  | Carrega e **valida** variáveis de ambiente no boot. App não sobe com config inválida.                                                                                                                                                               |
| `@nestjs/jwt`                        | 12.0.3                  | Assinatura/verificação de JWT.                                                                                                                                                                                                                      |
| `@nestjs/passport` + `passport-jwt`  | 12.0.0                  | Estratégia de autenticação plugável; guard de JWT pronto e testável.                                                                                                                                                                                |
| `@nestjs/swagger`                    | 12.0.2                  | OpenAPI gerado a partir dos DTOs. Doc que não desatualiza porque deriva do código.                                                                                                                                                                  |
| `@nestjs/throttler`                  | 6.7.1                   | Rate limiting em login e endpoints sensíveis.                                                                                                                                                                                                       |
| `prisma` / `@prisma/client`          | 7.10.1 (exato)          | ORM com migrations versionadas, tipos gerados do schema e queries parametrizadas.                                                                                                                                                                   |
| `class-validator`                    | 0.15.1                  | Validação de DTO no backend, integrada ao Swagger.                                                                                                                                                                                                  |
| `class-transformer`                  | 0.5.1                   | Serialização de resposta; permite excluir `passwordHash` por decorator.                                                                                                                                                                             |
| `@node-rs/argon2`                    | 2.2.2                   | Hash de senha Argon2id com binário pré-compilado (sem node-gyp).                                                                                                                                                                                    |
| `helmet`                             | 8.3.0                   | Cabeçalhos HTTP de segurança.                                                                                                                                                                                                                       |
| `nestjs-pino` + `pino` + `pino-http` | 5.3.1 / 10.4.0 / 11.0.0 | Log estruturado em JSON com request-id, com redação de campos sensíveis. `pino-http` é peer declarado do `nestjs-pino` e precisa ser instalado explicitamente.                                                                                      |
| `uuid`                               | 14.0.3                  | Gera UUIDv7 na aplicação (§4.2). `crypto.randomUUID()` do Node 24 só produz v4, e v4 é aleatório: destrói a localidade de índice que o v7, ordenável por tempo, preserva. Verificado: `v7()` retorna version 7 e as chaves saem em ordem crescente. |
| `reflect-metadata`                   | ^0.2                    | Requisito do DI do NestJS.                                                                                                                                                                                                                          |

**Avaliado e recusado:** `nestjs-zod` (peer incompatível), `argon2`/`bcrypt` (node-gyp),
`typeorm` (migrations menos previsíveis que as do Prisma), `@nestjs/cqrs` e event sourcing
(overengineering para este escopo), Redis (não há necessidade real de cache nesta escala).

## 3.4 Frontend

| Pacote                  | Versão                  | Por que está aqui                                                                                              |
| ----------------------- | ----------------------- | -------------------------------------------------------------------------------------------------------------- |
| `react`, `react-dom`    | 19.3.1                  | UI.                                                                                                            |
| `vite`                  | 8.3.4                   | Build e dev server.                                                                                            |
| `@vitejs/plugin-react`  | 6.1.2                   | HMR e JSX transform.                                                                                           |
| `typescript`            | 6.0.3                   | Mesma versão do backend (ver ADR-0001).                                                                        |
| `tailwindcss`           | 4.3.3                   | Estilos. v4 usa configuração CSS-first (`@theme`), o que encaixa no design system por tokens.                  |
| `shadcn/ui`             | CLI (não é dependência) | Copia o código do componente para o projeto. Sem lock-in e sem camada de tema opaca.                           |
| `lucide-react`          | 1.59.0                  | Ícones (requisito do shadcn/ui).                                                                               |
| `react-router`          | 8.4.0                   | Roteamento e rotas protegidas.                                                                                 |
| `@tanstack/react-query` | 5.104.3                 | Estado de servidor: cache, revalidação, loading/error por query. Remove a necessidade de estado global manual. |
| `react-hook-form`       | 7.90.0                  | Formulários com re-render mínimo.                                                                              |
| `zod`                   | 4.6.7                   | Schema de validação do formulário, compartilhado com a inferência de tipo.                                     |
| `@tanstack/react-table` | 9.3.1                   | Tabelas headless: ordenação e paginação sem impor markup.                                                      |
| `recharts`              | 3.10.1                  | Gráficos do dashboard.                                                                                         |

**Avaliado e recusado:** Next.js (não há necessidade de SSR/SEO em um app interno
autenticado; Vite + SPA é mais simples de explicar e hospedar), Redux/Zustand (React Query
já resolve o estado que existe aqui), `tailwindcss-animate` (substituído por
`tw-animate-css` na v4), bibliotecas de componentes fechadas (MUI, AntD) — conflitam com a
exigência de design system próprio.

## 3.5 Testes

| Pacote                       | Versão          | Uso                                                                                                                                                      |
| ---------------------------- | --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `vitest`                     | 5.0.5           | Runner único para backend e frontend. Escolhido sobre Jest por ser nativamente ESM/TS e por já ser o runner do Vite — um runner a menos para configurar. |
| `supertest`                  | 7.3.1           | Testes de integração HTTP contra a app Nest real.                                                                                                        |
| `@playwright/test`           | 1.64.1          | E2E dos dois fluxos críticos.                                                                                                                            |
| `@nestjs/testing`            | 12.1.3          | Módulos de teste e override de providers.                                                                                                                |
| `unplugin-swc` + `@swc/core` | 2.0.0 / 1.16.18 | **Somente no backend.** Transforma TS no Vitest preservando metadados de decorator. Ver §3.5.1.                                                          |
| `@vitest/coverage-v8`        | 5.0.5           | Relatório de cobertura, reportado como informação (§07).                                                                                                 |
| `@testing-library/react`     | atual na Fase 3 | Testes de componente por comportamento.                                                                                                                  |

### 3.5.1 Armadilha 4 — Vitest não transforma os decorators do NestJS

Encontrada ao planejar a Fase 2, e é a razão de `unplugin-swc` existir na lista.

O Vitest transforma TypeScript com o **esbuild** do Vite, e o esbuild não implementa
`emitDecoratorMetadata`. A injeção de dependência do NestJS depende exatamente desses
metadados: sem eles, `constructor(private prisma: PrismaService)` perde a informação de tipo
em tempo de execução e o container não sabe o que injetar. O sintoma é um teste que falha
com _"Nest can't resolve dependencies"_ mesmo com o módulo correto.

```ts
// backend/vitest.config.ts
import swc from 'unplugin-swc';

export default defineConfig({
  plugins: [
    swc.vite({
      jsc: {
        parser: { syntax: 'typescript', decorators: true },
        transform: { legacyDecorator: true, decoratorMetadata: true },
      },
    }),
  ],
});
```

O SWC substitui o esbuild apenas na etapa de transformação, com `legacyDecorator` e
`decoratorMetadata` ligados. O `nest build` de produção continua usando `tsc`, então o
build publicado não depende do SWC.

**Alternativa recusada:** usar Jest no backend e Vitest no frontend. Resolveria o problema,
mas ao custo de dois runners, duas configurações e duas sintaxes de mock no mesmo
repositório. Um plugin de transformação é mais barato que um segundo runner.

O frontend **não** precisa disso: React não usa decorator.

## 3.6 Infraestrutura

| Item                   | Escolha                                                                                             |
| ---------------------- | --------------------------------------------------------------------------------------------------- |
| Containerização        | Docker Compose (Postgres + backend + frontend)                                                      |
| Imagem do banco        | `postgres:17-alpine`, verificada localmente (§1.4)                                                  |
| CI                     | GitHub Actions: lint, typecheck, teste unitário, teste de integração com Postgres de serviço, build |
| Lint/format            | ESLint **10.13.0** (flat config) + Prettier 3.9.10 + typescript-eslint 8.71.2                       |
| Hooks de commit        | Husky + lint-staged + commitlint (Conventional Commits)                                             |
| Gerenciador de pacotes | npm (já instalado; `package-lock.json` versionado)                                                  |

**Correção sobre a versão do ESLint:** a Fase 1 registrou "ESLint 9". A revalidação de
versões mostrou que `eslint@latest` é **10.13.0**, com a 9.39.5 na tag `maintenance`. A
flat config continua sendo o formato (na 10 ela é o único formato, o que simplifica), e os
dois pacotes do ecossistema que importam declaram suporte:

```
npm view typescript-eslint peerDependencies
{ eslint: '^8.57.0 || ^9.0.0 || ^10.0.0', typescript: '>=4.8.4 <6.1.0' }

npm view eslint-plugin-react-hooks peerDependencies
{ eslint: '... || ^9.0.0 || ^10.0.0' }
```

O range `typescript: >=4.8.4 <6.1.0` também confirma que o TypeScript 6.0.3 do
[ADR-0001](adr/0001-versao-typescript.md) é suportado pelo typescript-eslint. Decisão:
ESLint 10.13.0.

## 3.7 Versões fixadas

A fixar em `.nvmrc` e `package.json`:

```
node  24.15.0
npm   11.12.1
```

Dependências diretas usarão `~` (patch livre) em vez de `^`, exceto `prisma` e
`@prisma/client`, que serão **exatas** pelo motivo da Armadilha 1.
