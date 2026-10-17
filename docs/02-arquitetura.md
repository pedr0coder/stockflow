# 02 — Arquitetura

## 2.1 Princípio que guia as decisões

> Arquitetura suficiente para o problema, não a arquitetura mais sofisticada possível.

O StockFlow é um app CRUD-intensivo com **um** núcleo de regra de negócio não trivial:
movimentação de estoque sob concorrência. A arquitetura deve concentrar rigor nesse núcleo
e ser deliberadamente simples em todo o resto.

Por isso o projeto **não** usa: Clean Architecture com 4 camadas e mappers por entidade,
CQRS, event sourcing, repositórios genéricos sobre o Prisma, microserviços, DDD com
aggregates e value objects. Cada um desses foi considerado e recusado: nenhum resolve um
problema que este sistema tem, e todos aumentam o custo de ler o código.

Essa recusa é uma decisão de engenharia e é defensável em entrevista. O inverso — adotar
tudo "porque é profissional" — é que precisaria de defesa.

## 2.2 Visão geral

```
┌──────────────────────────────────────────────────────────┐
│  Browser                                                 │
│  React 19 + Vite (SPA)                                   │
│  React Query (estado de servidor) · React Router (rotas)  │
└────────────────────────┬─────────────────────────────────┘
                         │ HTTPS · JSON
                         │ Bearer (access, em memória)
                         │ Cookie httpOnly (refresh)
┌────────────────────────▼─────────────────────────────────┐
│  API NestJS                                              │
│                                                          │
│  Pipeline por requisição:                                │
│  Helmet → CORS → Throttler → JwtAuthGuard →              │
│  RolesGuard → ValidationPipe → Controller                │
│                                                          │
│  Controller   recebe/valida/serializa (sem regra)        │
│  Service      regra de negócio (testável sem HTTP)       │
│  PrismaService  acesso a dados                           │
│                                                          │
│  Transversal: ExceptionFilter · Interceptor de auditoria │
│               · Logger Pino                              │
└────────────────────────┬─────────────────────────────────┘
                         │ SQL parametrizado (Prisma)
┌────────────────────────▼─────────────────────────────────┐
│  PostgreSQL                                              │
│  constraints · índices · transações · CHECK              │
│  (última linha de defesa das invariantes)                │
└──────────────────────────────────────────────────────────┘
```

## 2.3 Camadas no backend (três, não mais)

| Camada            | Responsabilidade                                                                  | Não faz                                    |
| ----------------- | --------------------------------------------------------------------------------- | ------------------------------------------ |
| **Controller**    | Rota, DTO de entrada, código HTTP, serialização, decorators de Swagger e de papel | Nenhuma regra de negócio                   |
| **Service**       | Regra de negócio, transações, orquestração. Recebe dados já validados             | Não conhece `Request`, `Response` nem HTTP |
| **PrismaService** | Cliente Prisma único, gerenciado pelo ciclo de vida do Nest                       | Não contém regra                           |

**Por que não há camada de repositório:** o `PrismaClient` já é tipado e já abstrai SQL.
Envolvê-lo em repositórios por entidade só reescreveria sua API com menos recursos.
A troca de ORM — único benefício real — não é um requisito deste produto.

Onde isso custaria testabilidade, o teste resolve com banco real: testes de integração
rodam contra um Postgres descartável. Mockar o banco para testar regra de estoque daria
falsa confiança, porque as invariantes de concorrência vivem **no banco**.

## 2.4 Organização por domínio

```
backend/src/
├── main.ts
├── app.module.ts
│
├── common/                     # transversal, sem regra de domínio
│   ├── decorators/             # @Roles, @CurrentUser, @Audit
│   ├── guards/                 # JwtAuthGuard, RolesGuard
│   ├── filters/                # AllExceptionsFilter
│   ├── interceptors/           # AuditInterceptor
│   ├── pipes/                  # ValidationPipe global
│   └── dto/                    # PaginationQueryDto, PageDto<T>
│
├── config/                     # schema e validação do .env
├── prisma/                     # PrismaService + PrismaModule
│
├── auth/                       # login, refresh, logout, /me
├── users/
├── categories/
├── suppliers/
├── products/
├── stock-movements/            # ← núcleo crítico
├── inventories/
├── reports/
├── audit/
└── dashboard/
```

Cada módulo de domínio segue a mesma forma:

```
products/
├── products.module.ts
├── products.controller.ts
├── products.service.ts
├── products.service.spec.ts
├── dto/
│   ├── create-product.dto.ts
│   ├── update-product.dto.ts
│   └── query-products.dto.ts
└── entities/
    └── product.entity.ts       # forma da resposta + Swagger
```

Previsibilidade é o objetivo: quem abre qualquer módulo encontra a mesma estrutura.

## 2.5 Organização do frontend

```
frontend/src/
├── main.tsx
├── router.tsx
│
├── app/
│   ├── providers.tsx           # QueryClient, Theme, Toaster
│   └── layouts/                # AppShell (sidebar + header), AuthLayout
│
├── components/
│   ├── ui/                     # shadcn/ui (gerado pelo CLI)
│   └── shared/                 # DataTable, PageHeader, EmptyState,
│                               # ErrorState, ConfirmDialog, StatCard
│
├── features/                   # espelha os domínios do backend
│   ├── auth/
│   ├── products/
│   │   ├── api.ts              # funções de fetch
│   │   ├── queries.ts          # hooks de React Query
│   │   ├── schemas.ts          # Zod
│   │   ├── components/
│   │   └── pages/
│   ├── categories/ suppliers/ movements/ inventories/
│   ├── reports/ dashboard/ users/ audit/
│
├── lib/
│   ├── api-client.ts           # fetch + refresh automático em 401
│   ├── format.ts               # datas, decimais, moeda (pt-BR)
│   └── utils.ts                # cn()
│
└── types/
```

O frontend espelha os domínios do backend de propósito: achar o código de uma tela não
exige mapa mental.

## 2.6 Contrato de erro (único em toda a API)

Um `AllExceptionsFilter` global garante uma só forma de erro. O frontend trata um formato,
não vários.

```json
{
  "statusCode": 409,
  "code": "INSUFFICIENT_STOCK",
  "message": "Estoque insuficiente para a saída solicitada.",
  "details": { "productId": "...", "available": "12.000", "requested": "20.000" },
  "timestamp": "2026-10-17T12:00:00.000Z",
  "path": "/api/v1/stock-movements",
  "requestId": "01JB..."
}
```

- `code` é estável e legível por máquina; o frontend decide a UI por ele, nunca pela string
  de `message`.
- `message` é destinada ao usuário final, em português.
- Erro 5xx **nunca** vaza stack trace ou mensagem do banco na resposta; o detalhe vai para
  o log com o mesmo `requestId`.

## 2.7 Versionamento e estrutura do repositório

API sob prefixo `/api/v1`. Swagger em `/api/docs`.

```
stockflow/
├── backend/
├── frontend/
├── docs/
│   └── adr/                    # decisões arquiteturais registradas
├── .github/workflows/
├── docker-compose.yml
├── .env.example
├── .gitignore
└── README.md
```

Dois `package.json` independentes, sem workspaces. Monorepo com workspaces traria
hoisting e resolução de dependência para um projeto de dois pacotes que nunca
compartilharão código — complexidade sem retorno.
