# 04 — Modelo de Dados

PostgreSQL 17 + Prisma 7.10.1. Migrations versionadas com `prisma migrate`.

## 4.1 Diagrama de relacionamentos

```
   Category 1──────N Product N──────1 Supplier
                       │ 1
                       │
                       │ N
                 StockMovement N──────1 User
                       │ 0..1
                       │
                       │ 0..1
                InventoryItem N──────1 Inventory N──────1 User (criador)
                       │                      0..1└─────1 User (aprovador)
                       │ N
                       └──────1 Product

   User 1──────N RefreshToken
   User 1──────N AuditLog
```

## 4.2 Decisões de tipo

| Decisão               | Escolha                  | Motivo                                                                                                                                                        |
| --------------------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Chave primária        | `uuid` (v7 na aplicação) | Não expõe volume de negócio na URL; permite gerar o ID antes do insert. UUIDv7 é ordenável por tempo, o que preserva a localidade de índice que o v4 destrói. |
| Quantidade de estoque | `Decimal(14,3)`          | Unidades fracionárias (kg, litro, metro) são reais em almoxarifado. **Float é proibido** — `0.1 + 0.2 != 0.3` em dinheiro e em estoque.                       |
| Custo unitário        | `Decimal(14,4)`          | 4 casas para custo médio sem erro de arredondamento acumulado.                                                                                                |
| Datas                 | `timestamptz`            | Sempre com timezone; conversão para horário local só na apresentação.                                                                                         |
| Enums                 | enum nativo do Postgres  | Validado pelo banco, não só pela aplicação.                                                                                                                   |
| Exclusão              | `isActive: boolean`      | Produto com histórico não pode ser apagado: destruiria a integridade da auditoria.                                                                            |

## 4.3 Enums

```prisma
enum UserRole        { ADMIN  MANAGER  OPERATOR }
enum UnitOfMeasure   { UN  KG  L  M  BOX  PACK }
enum MovementType    { IN  OUT  ADJUSTMENT }

enum MovementReason {
  PURCHASE  RETURN_IN  PRODUCTION_IN  TRANSFER_IN       // IN
  SALE  CONSUMPTION  LOSS  EXPIRY  TRANSFER_OUT         // OUT
  INVENTORY_ADJUSTMENT  CORRECTION                      // ADJUSTMENT
}

enum InventoryStatus { OPEN  COUNTING  PENDING_APPROVAL  APPROVED  CANCELLED }
```

`MovementReason` existe para que relatórios respondam _por que_ o estoque saiu — e não
apenas que saiu. Um campo de texto livre não permitiria agregar perdas por validade.

A combinação `type` × `reason` é validada no service: `SALE` com `type: IN` é rejeitado.

## 4.4 Tabelas

### User

| Campo                 | Tipo                | Observação                                     |
| --------------------- | ------------------- | ---------------------------------------------- |
| id                    | uuid PK             |                                                |
| name                  | varchar(120)        |                                                |
| email                 | varchar(180) UNIQUE | normalizado em lowercase antes de gravar       |
| passwordHash          | text                | Argon2id. Nunca sai em nenhuma resposta da API |
| role                  | UserRole            | default `OPERATOR`                             |
| isActive              | boolean             | default `true`; usuário inativo não autentica  |
| lastLoginAt           | timestamptz?        |                                                |
| createdAt / updatedAt | timestamptz         |                                                |

Índices: `email` (unique), `(isActive, role)`.

### RefreshToken

| Campo          | Tipo           | Observação                                        |
| -------------- | -------------- | ------------------------------------------------- |
| id             | uuid PK        |                                                   |
| userId         | uuid FK → User | `onDelete: Cascade`                               |
| tokenHash      | text UNIQUE    | **hash SHA-256 do token**, nunca o token em claro |
| expiresAt      | timestamptz    |                                                   |
| revokedAt      | timestamptz?   | preenchido na rotação ou no logout                |
| replacedById   | uuid?          | encadeia a rotação; permite detectar reuso        |
| userAgent / ip | text?          | contexto para auditoria de sessão                 |

Índices: `tokenHash` (unique), `(userId, revokedAt)`, `expiresAt`.

Vazamento do banco não entrega sessões ativas, porque só o hash é persistido.

### Category

`id`, `name` varchar(80) UNIQUE, `description` text?, `isActive`, timestamps.
Índices: `name` (unique), `(isActive, name)`.

### Supplier

`id`, `name` varchar(140), `taxId` varchar(18)? UNIQUE, `email`?, `phone`?, `notes`?,
`isActive`, timestamps.
Índices: `taxId` (unique), `name`, `(isActive, name)`.

### Product

| Campo                 | Tipo                | Observação                                      |
| --------------------- | ------------------- | ----------------------------------------------- |
| id                    | uuid PK             |                                                 |
| sku                   | varchar(40) UNIQUE  | identificador de negócio; uppercase normalizado |
| name                  | varchar(160)        |                                                 |
| description           | text?               |                                                 |
| categoryId            | uuid FK → Category  | `onDelete: Restrict`                            |
| supplierId            | uuid? FK → Supplier | `onDelete: SetNull`                             |
| unit                  | UnitOfMeasure       |                                                 |
| currentStock          | Decimal(14,3)       | default 0. **Mantido apenas por movimentação**  |
| minStock              | Decimal(14,3)       | default 0; base do alerta de estoque baixo      |
| unitCost              | Decimal(14,4)       | default 0                                       |
| isActive              | boolean             | default true                                    |
| createdAt / updatedAt | timestamptz         |                                                 |

Índices: `sku` (unique), `(isActive, name)`, `categoryId`, `supplierId`,
índice GIN trigram em `name` para busca parcial.

CHECK constraints (em migration SQL, pois o Prisma não as declara no schema):

```sql
ALTER TABLE products ADD CONSTRAINT products_current_stock_non_negative
  CHECK (current_stock >= 0);
ALTER TABLE products ADD CONSTRAINT products_min_stock_non_negative
  CHECK (min_stock >= 0);
ALTER TABLE products ADD CONSTRAINT products_unit_cost_non_negative
  CHECK (unit_cost >= 0);
```

**Sobre `currentStock` ser denormalizado:** o saldo poderia ser derivado somando
`StockMovement`. Guardá-lo é uma denormalização consciente — listagem e dashboard são as
telas mais acessadas e não devem agregar o histórico inteiro a cada consulta. O preço é
que saldo e histórico podem divergir, e esse risco é contido por três mecanismos:
atualização **sempre** na mesma transação do movimento, CHECK de não-negatividade no banco,
e um relatório de reconciliação (soma dos movimentos igual a `currentStock`) que vira teste
de integração.

### StockMovement — tabela imutável

| Campo           | Tipo                     | Observação                                    |
| --------------- | ------------------------ | --------------------------------------------- |
| id              | uuid PK                  |                                               |
| productId       | uuid FK → Product        | `onDelete: Restrict`                          |
| type            | MovementType             |                                               |
| reason          | MovementReason           |                                               |
| quantity        | Decimal(14,3)            | magnitude, **sempre > 0**                     |
| stockBefore     | Decimal(14,3)            | saldo antes, gravado dentro da transação      |
| stockAfter      | Decimal(14,3)            | saldo depois                                  |
| note            | varchar(500)?            |                                               |
| referenceDoc    | varchar(80)?             | nota fiscal, ordem, requisição                |
| userId          | uuid FK → User           | `onDelete: Restrict` — autor nunca se perde   |
| inventoryItemId | uuid? FK → InventoryItem | preenchido quando o ajuste veio de inventário |
| createdAt       | timestamptz              |                                               |

Índices: `(productId, createdAt DESC)`, `(createdAt DESC)`, `(type, createdAt DESC)`,
`userId`, `inventoryItemId`.

CHECK:

```sql
ALTER TABLE stock_movements ADD CONSTRAINT stock_movements_quantity_positive
  CHECK (quantity > 0);
ALTER TABLE stock_movements ADD CONSTRAINT stock_movements_stock_after_non_negative
  CHECK (stock_after >= 0);
```

**Imutabilidade:** não existe `updatedAt`, e a API não expõe `PATCH` nem `DELETE` para
movimentações. Corrigir um erro significa criar um movimento de `ADJUSTMENT`, que também
fica registrado. O histórico é o registro contábil do estoque; reescrevê-lo destruiria a
auditoria.

`stockBefore`/`stockAfter` são redundantes em teoria (dariam para reconstruir), mas tornam
o extrato auditável linha a linha sem recomputar a série inteira, e permitem detectar
divergência por simples comparação entre linhas consecutivas.

### Inventory

`id`, `code` varchar(30) UNIQUE (ex. `INV-2026-0001`), `status` InventoryStatus,
`note`?, `startedAt`, `closedAt`?, `createdById` FK → User,
`approvedById`? FK → User, `approvedAt`?.
Índices: `code` (unique), `(status, startedAt DESC)`.

### InventoryItem

| Campo       | Tipo                | Observação                           |
| ----------- | ------------------- | ------------------------------------ |
| id          | uuid PK             |                                      |
| inventoryId | uuid FK → Inventory | `onDelete: Cascade`                  |
| productId   | uuid FK → Product   | `onDelete: Restrict`                 |
| expectedQty | Decimal(14,3)       | **congelado** no momento da contagem |
| countedQty  | Decimal(14,3)?      | `null` = ainda não contado           |
| countedAt   | timestamptz?        |                                      |
| countedById | uuid? FK → User     |                                      |

Restrição: `@@unique([inventoryId, productId])` — um produto não é contado duas vezes no
mesmo inventário.

A divergência **não é coluna persistida**: é `countedQty - expectedQty`, calculada na
consulta. Persistir um valor derivado abriria espaço para ele ficar inconsistente.

`expectedQty` é gravado quando o item é contado, não quando o inventário abre — assim a
divergência compara a contagem física com o que o sistema dizia _naquele instante_, que é
a pergunta real do inventário.

### AuditLog

| Campo          | Tipo            | Observação                                                    |
| -------------- | --------------- | ------------------------------------------------------------- |
| id             | uuid PK         |                                                               |
| userId         | uuid? FK → User | `onDelete: SetNull`; nulo em login falho                      |
| actorEmail     | varchar(180)?   | preservado mesmo se o usuário for removido                    |
| action         | varchar(60)     | `LOGIN_SUCCESS`, `PRODUCT_UPDATED`, ...                       |
| entity         | varchar(40)?    | `Product`, `User`, ...                                        |
| entityId       | uuid?           |                                                               |
| before / after | jsonb?          | estado anterior/posterior, **com campos sensíveis removidos** |
| ip / userAgent | text?           |                                                               |
| createdAt      | timestamptz     |                                                               |

Índices: `(createdAt DESC)`, `(entity, entityId)`, `(userId, createdAt DESC)`, `action`.

Lista de campos **nunca** gravados em `before`/`after`:
`password`, `passwordHash`, `token`, `refreshToken`, `accessToken`, `secret`,
`authorization`, `apiKey`. A remoção acontece em uma função única e testada, não repetida
em cada chamada.

## 4.5 Concorrência: o problema central do projeto

### O problema

Dois operadores dão saída de 8 unidades de um produto com saldo 10, ao mesmo tempo.
Implementação ingênua:

```ts
const p = await prisma.product.findUnique({ where: { id } }); // ambos leem 10
if (p.currentStock < qty) throw new InsufficientStockError(); // ambos passam
await prisma.product.update({
  // ambos gravam 2
  where: { id },
  data: { currentStock: p.currentStock - qty },
});
```

Resultado: duas saídas de 8 aprovadas com saldo 10, e o saldo final fica errado. É uma
condição de corrida clássica (_lost update_) e nenhum nível de isolamento padrão a impede,
porque a decisão foi tomada fora do banco.

### A solução adotada: UPDATE condicional atômico

Uma única instrução faz a verificação e a escrita, e o próprio Postgres serializa as
atualizações concorrentes na mesma linha:

```sql
UPDATE products
   SET current_stock = current_stock - $1,
       updated_at    = now()
 WHERE id = $2
   AND is_active = true
   AND current_stock >= $1          -- a guarda vive DENTRO do UPDATE
RETURNING current_stock + $1 AS stock_before,
          current_stock     AS stock_after;
```

- Se retornar **1 linha**: a saída foi válida e o saldo já está correto.
  `stock_before` e `stock_after` vêm do banco, não de leitura anterior.
- Se retornar **0 linhas**: não havia saldo (ou o produto está inativo). O service lança
  `InsufficientStockError`, que o filtro traduz em HTTP 409 `INSUFFICIENT_STOCK`.

A transação então insere o `StockMovement` com os valores retornados. Se o insert falhar,
o rollback desfaz também a atualização do saldo:

```ts
await this.prisma.$transaction(
  async (tx) => {
    const [row] = await tx.$queryRaw<StockRow[]>(/* UPDATE condicional acima */);
    if (!row) throw new InsufficientStockError(productId, quantity);
    await tx.stockMovement.create({
      data: { ...dto, stockBefore: row.stockBefore, stockAfter: row.stockAfter, userId },
    });
  },
  { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted },
);
```

### Por que não as alternativas

| Alternativa                               | Por que não                                                                                                                                                                        |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SELECT ... FOR UPDATE` e depois `UPDATE` | Funciona, mas são duas idas ao banco e o lock fica aberto no meio. O UPDATE condicional obtém o mesmo lock de linha por menos tempo e em um round-trip.                            |
| Isolamento `Serializable`                 | Resolveria, mas ao custo de abortos por conflito de serialização que a aplicação teria de reexecutar. Custo desnecessário: `ReadCommitted` + UPDATE condicional já é correto aqui. |
| Lock otimista com coluna `version`        | Devolve o conflito para o cliente reenviar. Pior experiência para o operador e mais código, sem ganho.                                                                             |
| Confiar somente no CHECK `>= 0`           | O CHECK impede o estado inválido, mas o erro chegaria como violação de constraint genérica, sem distinguir "sem saldo" de bug. Ele é a **última** linha de defesa, não a primeira. |

### Três camadas de defesa, de propósito

1. **Service** — valida entrada, papel, produto ativo e combinação `type`/`reason`.
2. **UPDATE condicional** — garante a invariante sob concorrência.
3. **CHECK no Postgres** — garante que nem um bug futuro nem acesso direto ao banco
   gravem saldo negativo.

### Como isso é testado de verdade

Teste de integração com `Promise.all` de N saídas concorrentes sobre saldo conhecido,
contra Postgres real:

```
saldo inicial 10, 5 requisições paralelas de saída 3
esperado: exatamente 3 sucessos, 2 × HTTP 409, saldo final 1,
          e exatamente 3 linhas em stock_movements
```

O teste falha de forma determinística em uma implementação ingênua. Está detalhado em
[07-testes.md](07-testes.md).

## 4.6 Estoque negativo e semântica do ajuste

O requisito original pede "não permitir estoque negativo sem autorização explícita".
A implementação resolve isso **sem** permitir saldo negativo:

- `IN` e `OUT` nunca podem levar o saldo abaixo de zero;
- `ADJUSTMENT` recebe a **quantidade final correta** (valor absoluto), não um delta — que é
  a semântica real de uma recontagem: "o saldo correto é 7". Logo, o ajuste também não
  produz negativo;
- a "autorização explícita" é modelada como **permissão**: apenas `ADMIN` e `MANAGER`
  criam `ADJUSTMENT`, e todo ajuste é auditado com autor, motivo e saldos.

O CHECK `current_stock >= 0` permanece ativo e absoluto. Esta é uma reinterpretação
deliberada do requisito e está registrada em
[ADR-0003](adr/0003-estrategia-de-concorrencia.md).

## 4.7 Seed de desenvolvimento

`prisma/seed.ts` cria dados **declaradamente fictícios**: 3 usuários (um por papel), ~6
categorias, ~5 fornecedores, ~40 produtos e um histórico de movimentações gerado pelo
mesmo service usado em produção — não por insert direto. Assim o seed não pode produzir um
estado que a regra de negócio recusaria.

Nenhum dado real, nome de empresa ou processo interno de terceiros é usado.
Senhas do seed vêm de variável de ambiente, com valor apenas para ambiente local.
