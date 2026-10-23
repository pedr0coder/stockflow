# 05 — Contrato da API

Prefixo: `/api/v1` · Documentação OpenAPI: `/api/docs` (gerada dos DTOs)

Legenda de papéis: **A** = ADMIN · **M** = MANAGER · **O** = OPERATOR
Toda rota exige autenticação, exceto as marcadas como públicas.

## 5.1 Convenções

**Paginação** — todas as listagens usam o mesmo contrato:

```
GET /api/v1/products?page=1&limit=20&sort=name&order=asc&search=parafuso
```

```json
{
  "data": [/* ... */],
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 137,
    "totalPages": 7,
    "hasNext": true,
    "hasPrev": false
  }
}
```

`limit` é limitado a 100 no servidor, para que o cliente não force varredura de tabela.
`sort` aceita apenas uma allowlist de colunas por recurso — campo arbitrário na query
seria superfície de ataque e de erro.

**Códigos de status**

| Código | Uso                                                                 |
| ------ | ------------------------------------------------------------------- |
| 200    | Leitura ou atualização bem-sucedida                                 |
| 201    | Recurso criado                                                      |
| 204    | Operação sem corpo de resposta (logout)                             |
| 400    | Falha de validação de DTO                                           |
| 401    | Ausência ou invalidez de token                                      |
| 403    | Autenticado, mas sem permissão para a ação                          |
| 404    | Recurso inexistente                                                 |
| 409    | Conflito de estado de negócio (SKU duplicado, estoque insuficiente) |
| 422    | Entrada válida em forma, mas inválida em regra de negócio           |
| 413    | Corpo da requisição acima do limite aceito                          |
| 429    | Rate limit excedido                                                 |
| 500    | Erro inesperado (sem vazar detalhe interno)                         |

**Códigos de erro de negócio** (campo `code`, estável):

```
INSUFFICIENT_STOCK        PRODUCT_INACTIVE        SKU_ALREADY_EXISTS
EMAIL_ALREADY_EXISTS      INVALID_CREDENTIALS     USER_INACTIVE
CATEGORY_HAS_PRODUCTS     INVENTORY_NOT_OPEN      INVENTORY_ALREADY_APPROVED
INVALID_TYPE_REASON       REFRESH_TOKEN_REUSED    FORBIDDEN_ROLE
PAYLOAD_TOO_LARGE
```

**Forma do erro de validação** (400, `code: VALIDATION_ERROR`)

`details.fields` é um objeto indexado pelo **nome do campo**, com a lista de mensagens
daquele campo:

```json
{
  "statusCode": 400,
  "code": "VALIDATION_ERROR",
  "message": "Dados inválidos. Verifique os campos informados.",
  "details": {
    "fields": {
      "name": ["O nome deve ter no mínimo 2 caracteres."],
      "minStock": ["minStock deve ser um decimal com até 3 casas, como \"10.000\"."]
    }
  },
  "requestId": "01JB..."
}
```

Indexado pelo nome, e não uma lista de frases: um formulário precisa saber em qual campo
pintar o erro, e casar a mensagem por texto quebraria na primeira vez que a frase fosse
reescrita. Todos os campos inválidos vêm de uma vez, para que a tela não revele os
problemas um a um.

`message` é sempre texto para o usuário final, em português. Mensagem gerada por
framework ou biblioteca — `Cannot GET /x`, `ThrottlerException: ...`, erro do parser de
JSON — é substituída pelo texto padrão do status.

## 5.2 Autenticação — `/auth`

| Método | Rota            | Papéis      | Descrição                                                 |
| ------ | --------------- | ----------- | --------------------------------------------------------- |
| POST   | `/auth/login`   | público     | Retorna access token no corpo; refresh em cookie httpOnly |
| POST   | `/auth/refresh` | cookie      | Rotaciona o refresh e emite novo access                   |
| POST   | `/auth/logout`  | autenticado | Revoga o refresh atual (204)                              |
| GET    | `/auth/me`      | autenticado | Usuário atual e seu papel                                 |

Rate limit: `login` 5 tentativas / 15 min por IP+email; `refresh` 30 / 15 min por IP.

Não há endpoint público de cadastro no MVP: usuários são criados por ADMIN. Um estoque
não é um produto de autoatendimento, e cadastro aberto criaria uma brecha sem motivo de
negócio. Recuperação de senha fica para pós-MVP (exige provedor de e-mail).

## 5.3 Usuários — `/users`

| Método | Rota                 | Papéis      | Descrição                             |
| ------ | -------------------- | ----------- | ------------------------------------- |
| GET    | `/users`             | A, M        | Lista paginada                        |
| GET    | `/users/:id`         | A, M        | Detalhe                               |
| POST   | `/users`             | A           | Cria usuário                          |
| PATCH  | `/users/:id`         | A           | Atualiza nome/e-mail                  |
| PATCH  | `/users/:id/role`    | A           | Altera papel (auditado)               |
| PATCH  | `/users/:id/status`  | A           | Ativa/inativa                         |
| PATCH  | `/users/me/password` | autenticado | Troca a própria senha (exige a atual) |

`passwordHash` nunca é serializado — garantido por `@Exclude()` na entidade e verificado
por teste.

## 5.4 Categorias — `/categories`

| Método | Rota                     | Papéis  |
| ------ | ------------------------ | ------- |
| GET    | `/categories`            | A, M, O |
| GET    | `/categories/:id`        | A, M, O |
| POST   | `/categories`            | A, M    |
| PATCH  | `/categories/:id`        | A, M    |
| PATCH  | `/categories/:id/status` | A, M    |

Inativar categoria com produtos ativos retorna 409 `CATEGORY_HAS_PRODUCTS`.

## 5.5 Fornecedores — `/suppliers`

| Método | Rota                      | Papéis  |
| ------ | ------------------------- | ------- |
| GET    | `/suppliers`              | A, M, O |
| GET    | `/suppliers/:id`          | A, M, O |
| GET    | `/suppliers/:id/products` | A, M, O |
| POST   | `/suppliers`              | A, M    |
| PATCH  | `/suppliers/:id`          | A, M    |
| PATCH  | `/suppliers/:id/status`   | A, M    |

## 5.6 Produtos — `/products`

| Método | Rota                      | Papéis  | Descrição                           |
| ------ | ------------------------- | ------- | ----------------------------------- |
| GET    | `/products`               | A, M, O | Lista com busca, filtro e ordenação |
| GET    | `/products/:id`           | A, M, O | Detalhe                             |
| GET    | `/products/:id/movements` | A, M, O | Histórico do produto (paginado)     |
| POST   | `/products`               | A, M    | Cria                                |
| PATCH  | `/products/:id`           | A, M    | Atualiza dados cadastrais           |
| PATCH  | `/products/:id/status`    | A, M    | Ativa/inativa                       |

Filtros de `GET /products`:
`search` (nome ou SKU), `categoryId`, `supplierId`, `isActive`,
`stockStatus` = `low` | `out` | `ok`.
Ordenação permitida: `name`, `sku`, `currentStock`, `createdAt`, `updatedAt`.

`currentStock` **não é editável** por `PATCH /products/:id`. Saldo só muda por
movimentação — se o endpoint de cadastro pudesse alterá-lo, o histórico deixaria de
explicar o saldo. Tentar enviá-lo resulta em 400 (`forbidNonWhitelisted` no
ValidationPipe).

Não há `DELETE`. Inativação preserva o histórico.

## 5.7 Movimentações — `/stock-movements`

| Método | Rota                          | Papéis  | Descrição                              |
| ------ | ----------------------------- | ------- | -------------------------------------- |
| GET    | `/stock-movements`            | A, M, O | Histórico global, paginado e filtrável |
| GET    | `/stock-movements/:id`        | A, M, O | Detalhe                                |
| POST   | `/stock-movements/in`         | A, M, O | Entrada                                |
| POST   | `/stock-movements/out`        | A, M, O | Saída                                  |
| POST   | `/stock-movements/adjustment` | A, M    | Ajuste (quantidade final)              |

Sem `PATCH` e sem `DELETE`, por decisão de arquitetura (§4.4).

Filtros: `productId`, `type`, `reason`, `userId`, `dateFrom`, `dateTo`.

```http
POST /api/v1/stock-movements/out
{
  "productId": "018f...",
  "quantity": "12.500",
  "reason": "CONSUMPTION",
  "referenceDoc": "REQ-2026-0455",
  "note": "Requisição setor de manutenção"
}
```

```json
201 Created
{
  "id": "018f...",
  "productId": "018f...",
  "type": "OUT",
  "reason": "CONSUMPTION",
  "quantity": "12.500",
  "stockBefore": "40.000",
  "stockAfter": "27.500",
  "user": { "id": "018f...", "name": "Ana Souza" },
  "createdAt": "2026-10-17T13:45:02.118Z"
}
```

Sem saldo:

```json
409 Conflict
{
  "statusCode": 409,
  "code": "INSUFFICIENT_STOCK",
  "message": "Estoque insuficiente para a saída solicitada.",
  "details": { "available": "8.000", "requested": "12.500" },
  "requestId": "01JB..."
}
```

Decimais trafegam como **string** no JSON, não como number. `number` em JavaScript é
IEEE-754 e perderia precisão em quantidades e custos — o mesmo motivo de não usar float no
banco.

A escala é **fixa e vem da coluna**, não do valor: quantidade sempre com três casas
(`"0.000"`, `"19.500"`) e custo sempre com quatro (`"12.5000"`). Um saldo zero sai
`"0.000"`, nunca `"0"` — um cliente que corte a casa decimal por posição, ou compare
strings, leria errado. A mesma escala vale no snapshot do log de auditoria, para que log e
resposta não discordem sobre o valor.

**Busca textual** — `search` é tratado como texto literal: `%` e `_` são escapados antes de
chegar ao `LIKE`, então buscar `50%` encontra "Desconto 50%" em vez de devolver tudo.

## 5.8 Inventário — `/inventories`

| Método | Rota                                   | Papéis  | Descrição                             |
| ------ | -------------------------------------- | ------- | ------------------------------------- |
| GET    | `/inventories`                         | A, M, O | Lista                                 |
| GET    | `/inventories/:id`                     | A, M, O | Detalhe com itens e divergências      |
| POST   | `/inventories`                         | A, M    | Abre inventário e seleciona produtos  |
| PATCH  | `/inventories/:id/items/:itemId/count` | A, M, O | Registra quantidade contada           |
| POST   | `/inventories/:id/submit`              | A, M, O | Encerra contagem → `PENDING_APPROVAL` |
| POST   | `/inventories/:id/approve`             | A, M    | Aprova e gera os ajustes              |
| POST   | `/inventories/:id/cancel`              | A, M    | Cancela (histórico preservado)        |

Ciclo de vida:

```
OPEN ──► COUNTING ──► PENDING_APPROVAL ──► APPROVED
  └──────────┴────────────────┴───────────► CANCELLED
```

A aprovação é **uma transação única**: para cada item com divergência diferente de zero,
cria um `StockMovement` de `ADJUSTMENT` e atualiza o saldo; depois marca o inventário como
`APPROVED` com autor e timestamp. Se qualquer item falhar, nada é aplicado — não existe
inventário parcialmente aprovado.

Aprovar duas vezes retorna 409 `INVENTORY_ALREADY_APPROVED`: a transição de status é
condicionada ao status atual na própria cláusula `WHERE`, pelo mesmo raciocínio de
concorrência da §4.5.

## 5.9 Dashboard — `/dashboard`

| Método | Rota                                   | Papéis  |
| ------ | -------------------------------------- | ------- |
| GET    | `/dashboard/summary`                   | A, M, O |
| GET    | `/dashboard/movements-chart?days=30`   | A, M, O |
| GET    | `/dashboard/recent-movements?limit=10` | A, M, O |

`summary` retorna contagens agregadas por SQL (`COUNT`, `SUM`, comparação com `minStock`),
nunca valores fixos. Se não houver dados, retorna zeros — e a tela mostra _empty state_,
não números inventados.

## 5.10 Relatórios — `/reports`

| Método | Rota                                         | Papéis  |
| ------ | -------------------------------------------- | ------- |
| GET    | `/reports/low-stock`                         | A, M, O |
| GET    | `/reports/out-of-stock`                      | A, M, O |
| GET    | `/reports/movements?type=&dateFrom=&dateTo=` | A, M, O |
| GET    | `/reports/inventories`                       | A, M    |
| GET    | `/reports/divergences`                       | A, M    |
| GET    | `/reports/stock-reconciliation`              | A       | soma dos movimentos × `currentStock` |

`stock-reconciliation` existe para provar que a denormalização de §4.4 está consistente.
É o mesmo cálculo usado pelo teste de integração de reconciliação.

Exportação CSV entra no pós-MVP, como `?format=csv` nas mesmas rotas.

## 5.11 Auditoria — `/audit`

| Método | Rota                       | Papéis |
| ------ | -------------------------- | ------ |
| GET    | `/audit`                   | A      |
| GET    | `/audit/:entity/:entityId` | A, M   |

Somente leitura. Não existe rota de escrita nem de exclusão: o log é gravado por
interceptor, e um endpoint capaz de alterá-lo anularia seu propósito.

## 5.12 Infraestrutura

| Método | Rota            | Papéis  |
| ------ | --------------- | ------- |
| GET    | `/health`       | público | liveness                     |
| GET    | `/health/ready` | público | readiness (verifica o banco) |

`/health` não revela versão, dependências nem detalhes internos.
