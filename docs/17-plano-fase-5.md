# 17. Plano de Execução da Fase 5 (Estoque e inventário)

> Objetivo do roadmap aprovado: entregar a **movimentação de estoque com saldo que nunca
> fica negativo, o inventário com aprovação atômica, os relatórios e o dashboard**, com os
> testes de concorrência como critério de aceite.
>
> É a fase que o roadmap chama de crítica e que a §10 classifica como o maior risco do
> produto (R5). Se algo aqui ficar instável, as fases seguintes herdam o problema.
>
> **Este documento é planejamento.** Nada foi implementado no projeto: nenhuma dependência
> foi instalada, nenhuma migration foi criada ou executada, nenhum arquivo de código ou de
> teste foi alterado. Toda evidência citada vem de bancos descartáveis e de cópias fora do
> repositório, removidos ao final (§17.8.8).

## Registro de revisões

| Versão | O que mudou                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| v1     | Plano inicial, com as decisões D1 a D16 propostas.                                                                                                                                                                                                                                                                                                                                                                                     |
| v2     | D1 a D4 aprovadas (D2 e D4 com condições). Mecanismo de D2, semântica do delta, auditoria transacional, provas de atomicidade, migration validada em SQL. D5 a D16 pendentes.                                                                                                                                                                                                                                                          |
| v3     | **D5 a D16 e D18 decididas. D17 analisada contra a alternativa de tabela de reserva, com recomendação.** Marcos redefinidos: **5A = estoque, 5B = inventário, dashboard, relatórios e seed.** Migration dividida em duas. Evidência via Prisma real, não só SQL. Requisições duplicadas, consistência após falhas e compatibilidade com o Prisma tratadas com testes. Riscos aceitos registrados.                                      |
| v4     | **Marco 5A implementado e validado (2026-10-26).** D19 aplicada ao schema. Migration `20261027000000_phase5a_stock_integrity` criada, validada em banco descartável e aplicada aos bancos reais. Resultado real registrado no §17.17: 199 testes unitários e 379 de integração, critérios de aceite conferidos item a item (com as exceções honestas — AT-8 não implementado, PG-4/PG-6 parciais/não aplicáveis). D17 (5B) não tocada. |

### Situação das decisões em uma tabela

| Situação                                | Decisões                                                                                                                                                         |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Aprovadas**                           | D1, D2, D3, D4, D5, D6, D7, D8, D9 (restrita), D10, D11, D12, D13 (idempotente), D14 (provisória), D15, D16, D18 (provisória)                                    |
| **Aguardam a sua aprovação específica** | **D17** (recomendação: coluna `in_progress`, índice único parcial e 2 triggers, §17.8.6) e **D19** (nova: declarar o índice trigram no `schema.prisma`, §17.8.5) |
| **Nenhuma migration foi executada**     | Cada uma das duas migrations (5A e 5B) só será criada e aplicada com autorização específica, no respectivo marco                                                 |

## 17.1 Estado verificado do repositório

Conferido por comando antes de planejar.

| Item                      | Estado                                                                                                             |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Diretório                 | `C:\Users\pedro\Desktop\dev\stockflow`                                                                             |
| Branch / `HEAD`           | `main` / `555efa3`                                                                                                 |
| `origin`                  | `https://github.com/pedr0coder/stockflow.git`, à frente 0 e atrás 0                                                |
| Árvore de trabalho        | limpa, exceto este documento                                                                                       |
| CI do `HEAD`              | concluído com sucesso (confirmado pelo responsável)                                                                |
| Rotas / testes            | 31 rotas; 147 unitários e 293 de integração                                                                        |
| Migrations                | uma (`20261017071012_init`)                                                                                        |
| Dados nas tabelas da fase | **zero linhas** em `stock_movements`, `inventories` e `inventory_items`, nos bancos `stockflow` e `stockflow_test` |
| CHECKs / triggers         | exatamente os 5 CHECKs da Fase 2; nenhum trigger de usuário                                                        |
| Prisma                    | 7.10.1, versão exata; config em `prisma7.config.ts`; script `prisma:migrate` aponta para `migrate dev`             |
| Pendência herdada         | abort intermitente do Node 24 no Windows, **não resolvido**                                                        |

Já existem, prontos: os códigos `INSUFFICIENT_STOCK`, `PRODUCT_INACTIVE`, `INVALID_TYPE_REASON`,
`INVENTORY_NOT_OPEN` e `INVENTORY_ALREADY_APPROVED`; o serializador global de `Decimal` com
escala por campo; o contexto de auditoria por `AsyncLocalStorage`; o padrão de UPDATE
condicional (na inativação de categoria); e `$transaction` interativa. Essas transações
**não declaram o isolamento** (valem o `ReadCommitted` padrão do PostgreSQL), e a Fase 5
passa a declará-lo no código.

## 17.2 Escopo e marcos

Escopo do roadmap, sem alteração: `stock-movements` com UPDATE condicional atômico;
transações, `stockBefore`/`stockAfter` e imutabilidade; CHECK constraints em migration SQL;
`inventories` (abrir, contar, divergência, aprovar em transação única, cancelar); validação
de `type × reason`; relatórios incluindo reconciliação; dashboard com agregações SQL reais;
testes de concorrência e de divergência. Mais o que a Fase 4 deixou para esta:
`GET /products/:id/movements` e o seed com movimentações pelo service real.

**Os dois marcos são independentes**, como você definiu. **22 rotas novas, 53 no fim.**

| Marco  | Conteúdo                                                                   | Rotas novas                                                  | Rotas totais |
| ------ | -------------------------------------------------------------------------- | ------------------------------------------------------------ | ------------ |
| **5A** | Movimentações, regras de estoque, transações, concorrência e imutabilidade | `stock-movements` (5) e `products/:id/movements` (1) = **6** | **37**       |
| **5B** | Inventários, dashboard, relatórios e seed                                  | `inventories` (7), `dashboard` (3), `reports` (6) = **16**   | **53**       |

**Regras de condução, para os dois marcos:**

1. Cada marco **termina** com testes, documentação, revisão e a **sua autorização** para
   commits e push. Nada é versionado ou publicado antes.
2. **O 5B só começa depois da validação do 5A**: CI Linux verificado no commit do 5A e a
   sua autorização explícita (§17.15).
3. Cada marco tem a **sua migration**, aplicada somente com autorização específica.
4. O frontend não é tocado. Nenhum dado fictício é apresentado como real (o seed é
   declaradamente fictício, §17.9).

**Os três critérios do roadmap, distribuídos:**

| Critério do roadmap                                                              | Marco                                                                                |
| -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| 5 saídas concorrentes sobre saldo 10: 3 sucessos, 2 × 409, saldo 1, 3 movimentos | **5A**                                                                               |
| Aprovação dupla de inventário: um 200 e um 409                                   | **5B**                                                                               |
| Reconciliação consistente após ~200 movimentações                                | invariante e volume no **5A** (pelo service); rota e cenário com aprovação no **5B** |

### Fora da Fase 5

Alteração no frontend (Fase 6); E2E (Fase 7); CSV, alerta automático, custo médio, múltiplos
depósitos e QR Code (pós-MVP); chave de idempotência (D14, provisório); bloqueio de
movimentação durante inventário (D18, provisório); revogação de `UPDATE`/`DELETE` ao usuário da
aplicação (Fase 8). `TRANSFER_IN` e `TRANSFER_OUT` são só motivos: **não há transferência
entre locais**.

## 17.3 Inconsistências e achados

### Resolvidas por decisão sua

| #   | Inconsistência                                                | Resolução                                                                                |
| --- | ------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| I1  | Aprovação com duas semânticas (ADR-0003 absoluto, §7.3 delta) | D1: **delta**; o ajuste manual continua absoluto                                         |
| I2  | `expected_qty NOT NULL` contra "gravado na contagem"          | D4: coluna anulável (migration 5B)                                                       |
| I3  | `quantity` ambíguo no ajuste                                  | D7: o campo de entrada é **`finalQuantity`**, e a nota é obrigatória                     |
| I4  | Auditoria fora da transação e que engole erro                 | D3: `recordInTransaction`, sem alterar o `record()`                                      |
| I5  | Códigos de erro insuficientes para o ciclo do inventário      | D5: `INVENTORY_INVALID_STATE` e `PRODUCT_IN_OPEN_INVENTORY`; D6: 422 para "sem contagem" |
| I6  | Limite de 16 KiB contra a seleção de produtos                 | D11: no máximo 200 ids; limite global intacto (§17.4.5)                                  |
| I13 | Dashboard sem indicadores definidos                           | D10: os quatro propostos                                                                 |
| I14 | `reports/movements` igual à listagem                          | D16: agregado por tipo e motivo                                                          |
| I16 | Filtros de data sem formato                                   | D16: ISO 8601, intervalo semiaberto em UTC                                               |

### Registro, com a correção prevista

| #   | Registro                                                                                                        |
| --- | --------------------------------------------------------------------------------------------------------------- |
| I7  | Os CHECKs do roadmap já existem (Fase 2). A migration **não os repete**, e isso foi verificado (§17.8.8).       |
| I8  | A §7.3 cita exceções que a Fase 4 trocou (`NotFoundException`, `BadRequestException`). Texto atualizado no fim. |
| I9  | `details` do `INSUFFICIENT_STOCK` com `productId`, `available` e `requested`; a §5.7 é corrigida.               |
| I10 | A §8.5 diz "dois pontos de `$queryRaw`"; passam a ser vários. Todo SQL cru em `*.sql.ts`, só template tagged.   |
| I11 | `inventory_item_id` é `@unique`, mais forte que o documentado. Fica, e a §4.4 é corrigida.                      |
| I12 | A §5.11 diz que o log é gravado por interceptor; quem grava é o service. Correção de texto.                     |
| I15 | O limite de 100 escritas/min por usuário impede gerar ~200 movimentos por HTTP. O volume é gerado pelo service. |

### Achados novos desta revisão, todos medidos

| #       | Achado                                                                                                                                                                                                                                                                                                       | Consequência                                                                                                    |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| **I17** | **`created_at` via Prisma vem do relógio do cliente no instante do INSERT, não do início da transação.** Medido: 1.504 ms depois do início, com `now()` do banco em 0 ms. O risco de ordem invertida do extrato **não existe dentro de um processo**. Com mais de uma instância, vale a defasagem de relógio | Movimentações sempre por `tx.stockMovement.create`. **Proibido `INSERT` cru** sem `clock_timestamp()` explícito |
| **I18** | **A linha de base do Prisma já tem drift hoje.** O `migrate diff` quer remover `products_name_trgm_idx`, que a Fase 2 criou e o schema não declara. Como o script `prisma:migrate` é `migrate dev`, qualquer pessoa que o rode geraria um `DROP INDEX` do índice de busca                                    | **D19**: declarar o índice no schema. Medido: o drift cai a **zero**                                            |
| **I19** | **O Prisma classifica errado o `restrict_violation` (23001) como `P2003` (chave estrangeira)**. Um `RAISE` comum chega como `P2039`. O código real está em `meta.driverAdapterError.cause.originalCode`                                                                                                      | Os triggers usam **SQLSTATE próprios** (`SF001`, `SF002`), medidos chegando intactos como `originalCode`        |
| **I20** | **Índice único parcial declarado no schema exige o preview `partialIndexes` e faz o cliente expor `productId` como chave única**, o que é enganoso (a unicidade vale só entre itens em andamento). Sem declarar, o Prisma o ignora (verificado em 7.10.1)                                                    | Não ligar o preview. Guardar o índice por **teste de catálogo** e por **teste de drift zero** (§17.8.5)         |
| **I21** | `$queryRaw` devolve `numeric` como **`Prisma.Decimal`** (confirmado), e `count(*)` como `bigint`, que quebra o `JSON.stringify` (confirmado)                                                                                                                                                                 | Fecha o risco de tipo do `numeric`. `::int` obrigatório em contagens                                            |
| **I22** | `pg_sleep` devolve `void`, que o `$queryRaw` não desserializa                                                                                                                                                                                                                                                | Nos testes, `$executeRaw`                                                                                       |

## 17.4 Endpoints

Papéis: **A** = ADMIN, **M** = MANAGER, **O** = OPERATOR. Todo corpo é validado por DTO com
`whitelist` e `forbidNonWhitelisted`, toda rota com `:id` usa `ParseUUIDPipe`, e decimais
chegam e saem como **string** na escala da coluna (`"12.500"`).

### 17.4.1 `/stock-movements` (5 rotas, marco 5A)

| Método | Rota                          | Papéis  | Sucesso | Descrição                             |
| ------ | ----------------------------- | ------- | ------- | ------------------------------------- |
| POST   | `/stock-movements/in`         | A, M, O | 201     | Entrada                               |
| POST   | `/stock-movements/out`        | A, M, O | 201     | Saída                                 |
| POST   | `/stock-movements/adjustment` | A, M    | 201     | Ajuste para a quantidade final        |
| GET    | `/stock-movements`            | A, M, O | 200     | Histórico global, paginado, filtrável |
| GET    | `/stock-movements/:id`        | A, M, O | 200     | Detalhe                               |

Sem `PATCH` e sem `DELETE`: caem no 404 padrão de rota inexistente, com teste.

| Campo           | Entrada  | Saída    | Ajuste                               | Regra                                                                        |
| --------------- | -------- | -------- | ------------------------------------ | ---------------------------------------------------------------------------- |
| `productId`     | sim      | sim      | sim                                  | UUID                                                                         |
| `quantity`      | sim      | sim      | não                                  | string decimal, até 3 casas, **maior que zero**, teto de 11 dígitos inteiros |
| `finalQuantity` | não      | não      | sim                                  | string decimal, até 3 casas, **zero ou mais**, mesmo teto                    |
| `reason`        | sim      | sim      | sim                                  | enum; combinação com o tipo validada no service                              |
| `referenceDoc`  | opcional | opcional | opcional                             | até 80 caracteres                                                            |
| `note`          | opcional | opcional | **obrigatória**, mínimo 3 caracteres | até 500 caracteres                                                           |

Mais de 3 casas é **recusado, não arredondado**. O teto de 11 dígitos inteiros vem de
`numeric(14,3)`. **O cliente nunca envia**, e o DTO recusa com 400: `type` (vem da rota),
`userId` (vem do token), `stockBefore`, `stockAfter`, `inventoryItemId`, `createdAt`, `id`.

| Rota          | Motivos aceitos                                                                                                                                    |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/in`         | `PURCHASE`, `RETURN_IN`, `PRODUCTION_IN`, `TRANSFER_IN`                                                                                            |
| `/out`        | `SALE`, `CONSUMPTION`, `LOSS`, `EXPIRY`, `TRANSFER_OUT`                                                                                            |
| `/adjustment` | **somente `CORRECTION`** (D8). `INVENTORY_ADJUSTMENT` é reservado à aprovação de inventário, para que ninguém forje um ajuste com cara de contagem |

Resposta, filtros (`productId`, `type`, `reason`, `userId`, `dateFrom`, `dateTo`, `page`,
`limit` até 100) e ordenação (`createdAt` decrescente, desempate por `id` decrescente) como no
§5.7. **Erros:**

| Situação                                      | HTTP | `code`                 | `details`                             |
| --------------------------------------------- | ---- | ---------------------- | ------------------------------------- |
| DTO inválido, quantidade zero/negativa/escala | 400  | `VALIDATION_ERROR`     | `fields`                              |
| Papel insuficiente (ajuste por OPERATOR)      | 403  | `FORBIDDEN_ROLE`       |                                       |
| Produto inexistente                           | 404  | `NOT_FOUND`            |                                       |
| Produto inativo                               | 409  | `PRODUCT_INACTIVE`     | `productId`                           |
| Saída maior que o saldo                       | 409  | `INSUFFICIENT_STOCK`   | `productId`, `available`, `requested` |
| Motivo incompatível com o tipo                | 422  | `INVALID_TYPE_REASON`  | `type`, `reason`, `allowed`           |
| Ajuste que não muda o saldo                   | 422  | `UNPROCESSABLE_ENTITY` | `current`                             |
| Entrada que estouraria o saldo máximo         | 422  | `UNPROCESSABLE_ENTITY` | `current`, `requested`                |
| Corpo acima de 16 KiB                         | 413  | `PAYLOAD_TOO_LARGE`    |                                       |
| Limite de escrita (100/min)                   | 429  | `RATE_LIMIT_EXCEEDED`  |                                       |

### 17.4.2 `GET /products/:id/movements` (1 rota, marco 5A)

A, M, O. Histórico do produto, paginado, `createdAt` decrescente. Produto inexistente: 404;
produto **sem** movimentação: lista vazia. Fica no `ProductsController`.

### 17.4.3 `/inventories` (7 rotas, marco 5B)

| Método | Rota                                   | Papéis  | Descrição                                    |
| ------ | -------------------------------------- | ------- | -------------------------------------------- |
| GET    | `/inventories`                         | A, M, O | Lista paginada, filtro por `status`          |
| GET    | `/inventories/:id`                     | A, M, O | Detalhe com itens e divergências             |
| POST   | `/inventories`                         | A, M    | Abre e seleciona produtos (1 a 200 ids)      |
| PATCH  | `/inventories/:id/items/:itemId/count` | A, M, O | Registra a quantidade contada                |
| POST   | `/inventories/:id/submit`              | A, M, O | Encerra a contagem, vai a `PENDING_APPROVAL` |
| POST   | `/inventories/:id/approve`             | A, M    | Aprova e aplica os ajustes por delta         |
| POST   | `/inventories/:id/cancel`              | A, M    | Cancela, preservando o histórico             |

**Detalhe**: cada item traz `expectedQty` (nulo até ser contado), `countedQty`, `divergence`
(`countedQty − expectedQty`, calculada na resposta em aritmética decimal), `countedAt`,
`countedBy` e, para o contado, `currentStock`, `movedSinceCount` (`currentStock − expectedQty`)
e `movementsSinceCount` (quantidade de movimentos do produto depois da contagem). Servem
para que o aprovador veja a deriva **antes** de aprovar (§17.6.7). **Aprovação** devolve o
inventário `APPROVED` e a lista `adjustments` por item (`appliedDelta`, `movedSinceCount`,
`stockBefore`, `stockAfter`, `movementId`), mais contadores.

| Situação                                                     | HTTP | `code`                                      |
| ------------------------------------------------------------ | ---- | ------------------------------------------- |
| Inventário ou item inexistente (ou item de outro inventário) | 404  | `NOT_FOUND`                                 |
| Contar ou enviar com o inventário fora de `OPEN`/`COUNTING`  | 409  | `INVENTORY_NOT_OPEN`                        |
| Aprovar um inventário já aprovado                            | 409  | `INVENTORY_ALREADY_APPROVED`                |
| Aprovar ou cancelar fora do estado permitido                 | 409  | `INVENTORY_INVALID_STATE` (novo, D5)        |
| Produto já em outro inventário não finalizado                | 409  | `PRODUCT_IN_OPEN_INVENTORY` (novo, D5)      |
| Enviar ou aprovar sem nenhum item contado                    | 422  | `UNPROCESSABLE_ENTITY` (D6)                 |
| Aprovação que levaria um saldo abaixo de zero                | 409  | `INSUFFICIENT_STOCK`, com `inventoryItemId` |
| Aprovação que estouraria o saldo máximo                      | 422  | `UNPROCESSABLE_ENTITY`                      |
| Mais de 200 produtos na abertura                             | 400  | `VALIDATION_ERROR`                          |
| Produto inexistente na seleção                               | 422  | `UNPROCESSABLE_ENTITY`, com os ids          |
| Corpo acima de 16 KiB                                        | 413  | `PAYLOAD_TOO_LARGE`                         |

### 17.4.4 `/dashboard` (3 rotas) e `/reports` (6 rotas), marco 5B

Todas somente leitura, com agregação **em SQL**, zero quando não há dado.

| Rota                                       | Papéis  | Conteúdo (D10, D16)                                                                           |
| ------------------------------------------ | ------- | --------------------------------------------------------------------------------------------- |
| `GET /dashboard/summary`                   | A, M, O | Produtos ativos; estoque baixo (`0 < saldo <= mínimo`); sem estoque; movimentações em 30 dias |
| `GET /dashboard/movements-chart?days=30`   | A, M, O | Série diária por tipo, UTC. `days` de 1 a 90                                                  |
| `GET /dashboard/recent-movements?limit=10` | A, M, O | Últimas movimentações. `limit` de 1 a 50                                                      |
| `GET /reports/low-stock`                   | A, M, O | Produtos ativos com `0 < saldo <= mínimo`, com o déficit                                      |
| `GET /reports/out-of-stock`                | A, M, O | Produtos ativos com `saldo = 0`                                                               |
| `GET /reports/movements`                   | A, M, O | **Agregado** por tipo e motivo no período (contagem e soma)                                   |
| `GET /reports/inventories`                 | A, M    | Um resumo por inventário                                                                      |
| `GET /reports/divergences`                 | A, M    | Itens divergentes de inventários **aprovados**, com `movedSinceCount`                         |
| `GET /reports/stock-reconciliation`        | A       | Saldo gravado contra saldo derivado do histórico                                              |

`dateFrom`/`dateTo`: ISO 8601; sem horário, o intervalo é semiaberto e inclui o dia inteiro,
em UTC. O fuso de exibição é da Fase 6.

### 17.4.5 Tamanho de corpo: como o limite de 16 KiB é respeitado (D11)

O limite global (`REQUEST_BODY_LIMIT_BYTES`, §16.11.2 da Fase 4) **não muda, não ganha exceção
por rota e não é contornado**. Pior caso por endpoint, contando até 6 bytes por unidade de
texto (escape `\uXXXX`):

| Endpoint                  | Pior caso                                               | Bytes                    | % de 16 KiB |
| ------------------------- | ------------------------------------------------------- | ------------------------ | ----------- |
| `POST /stock-movements/*` | ids, quantidade, motivo, `referenceDoc` 80 e `note` 500 | ~3,6 KiB                 | 22%         |
| `PATCH .../count`         | `{"countedQty":"..."}`                                  | < 60 B                   | < 1%        |
| `POST /inventories`       | **200 UUIDs** (38 B mais vírgula) e `note` 500          | **10.826 B (~10,6 KiB)** | **66%**     |

Conta do inventário: `{"productIds":[` (15) + 200 × 38 + 199 vírgulas (7.799) + `]` (1) +
`,"note":"` (9) + 500 × 6 (3.000) + `"}` (2) = 10.826. Margem de 5.558 B; o teto de 200 é regra
de negócio, não o máximo de bytes (cabem ~340).

| Camada | O que a requisição encontra                        | Resultado                                                 |
| ------ | -------------------------------------------------- | --------------------------------------------------------- |
| 1      | corpo acima de 16 KiB                              | 413 `PAYLOAD_TOO_LARGE`, antes de qualquer guard          |
| 2      | corpo dentro do limite mas com mais de 200 ids     | 400 `VALIDATION_ERROR`, antes de qualquer acesso ao banco |
| 3      | até 200 ids com algum inexistente                  | 422, com os ids                                           |
| 4      | até 200 ids com algum em inventário não finalizado | 409 `PRODUCT_IN_OPEN_INVENTORY`                           |

Depósito com mais de 200 produtos: **vários inventários disjuntos** (a D2 permite), por
categoria. Evolução fora da fase: seleção por filtro no servidor. **Não será feito:** subir o
limite global, nem parser com limite maior para uma rota. Provas: o corpo exato do pior caso
devolve 201; 201 ids devolvem 400; 16 KiB + 1 devolve 413; um teste calcula o pior caso de
cada DTO da fase e falha se algum passar do orçamento.

## 17.5 Concorrência e transações: o núcleo da fase (marco 5A)

### 17.5.1 Princípio

O ADR-0003 vale sem mudança: **verificação e escrita na mesma instrução SQL**, dentro de uma
transação `ReadCommitted` **declarada**. Nenhum isolamento maior, nenhum `FOR UPDATE`
separado para a decisão, nenhuma coluna `version`. A fase estende o princípio da saída à
entrada, ao ajuste e à aprovação, o que pede um adendo ao ADR-0003 (§17.14).

### 17.5.2 As três instruções de saldo

Todas por `$queryRaw` com template tagged, decimais como **string** com `::numeric`:

```sql
-- Saída (a do ADR)
UPDATE products SET current_stock = current_stock - ${q}::numeric, updated_at = now()
 WHERE id = ${p}::uuid AND is_active = true AND current_stock >= ${q}::numeric
RETURNING current_stock + ${q}::numeric AS stock_before, current_stock AS stock_after

-- Entrada
UPDATE products SET current_stock = current_stock + ${q}::numeric, updated_at = now()
 WHERE id = ${p}::uuid AND is_active = true
RETURNING current_stock - ${q}::numeric AS stock_before, current_stock AS stock_after

-- Ajuste para a quantidade final (CTE que também trava a linha e lê o saldo anterior)
WITH prev AS (SELECT id, current_stock FROM products WHERE id = ${p}::uuid AND is_active = true FOR UPDATE)
UPDATE products x SET current_stock = ${f}::numeric, updated_at = now()
  FROM prev WHERE x.id = prev.id AND prev.current_stock <> ${f}::numeric
RETURNING prev.current_stock AS stock_before, x.current_stock AS stock_after
```

**Zero linhas não diz por quê.** Dentro da mesma transação, uma leitura classifica: produto
ausente (404), inativo (409 `PRODUCT_INACTIVE`), saldo menor (409 `INSUFFICIENT_STOCK`),
ajuste sem efeito (422). `available` no 409 é um **retrato informativo**: a recusa já foi
decidida atomicamente pelo UPDATE.

**Validado em PostgreSQL real e agora também pelo Prisma** (cliente gerado, driver adapter,
`$transaction` interativa com `ReadCommitted`):

| Cenário                                                             | Resultado                                                                                         |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Saída de 8 e saída de 8 sobre saldo 10, em duas sessões             | a segunda esperou o commit da primeira e devolveu **0 linhas**                                    |
| Ajuste depois de uma saída concorrente, e saída depois de um ajuste | o segundo enxerga o saldo **já atualizado** (`stock_before = 7`)                                  |
| Dois ajustes para o mesmo valor                                     | o segundo devolve 0 linhas (sem efeito)                                                           |
| **5 saídas de 3 sobre saldo 10, pelo Prisma**                       | **3 sucessos, 2 `INSUFFICIENT_STOCK`, saldo 1, 3 movimentos, 3 auditorias, Σ(after−before) = −9** |
| `$queryRaw` com `numeric`                                           | devolve `Prisma.Decimal`, nunca `number`                                                          |

### 17.5.3 A transação

```ts
await prisma.$transaction(
  async (tx) => {
    const row = await applyBalanceChange(tx, ...);          // 1. UPDATE condicional
    const movement = await tx.stockMovement.create({ ... }); // 2. grava o movimento (ORM, relógio no INSERT)
    await audit.recordInTransaction(tx, { ... });            // 3. auditoria obrigatória
    return movement;
  },
  { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, timeout: 10_000 },
);
```

O bloqueio da linha vem do passo 1 e vai até o commit; **nada lento dentro da transação**.
Falha nos passos 2 ou 3 desfaz o saldo (§17.7.4). `id` (UUIDv7) e `createdAt` saem **depois**
do UPDATE (I17).

### 17.5.4 Precisão e limites numéricos

- `numeric` via `$queryRaw` volta como `Prisma.Decimal` (confirmado).
- `COUNT(*)` volta como `bigint` e quebra o `JSON.stringify` (confirmado). **`::int`
  obrigatório** em toda contagem, e `SUM(...)::text` em toda soma de quantidade.
- Teto de 11 dígitos inteiros no DTO; como o saldo é uma **soma**, a entrada ainda pode
  estourar a coluna. **Medido via Prisma:** o `numeric field overflow` chega como `P2010`
  com `originalCode = 22003`, e o service o traduz em 422 (com teste).
- **Erros do banco chegam por `meta.driverAdapterError.cause.originalCode`.** O código de
  alto nível do Prisma não basta (I19). Um helper `pgErrorCode(error)` é a única porta.

### 17.5.5 Reconciliação

Saldo derivado = soma de `stock_after − stock_before` dos movimentos do produto (a coluna
`quantity` do ajuste é só magnitude). A soma **não depende de ordem**. O SQL vive em
`stock-movements.sql.ts` e é usado por **um único** lugar de verdade: o invariante dos
testes do 5A e, no 5B, a rota `stock-reconciliation`.

```sql
SELECT p.id, p.current_stock, COALESCE(SUM(m.stock_after - m.stock_before), 0) AS derived_stock
  FROM products p LEFT JOIN stock_movements m ON m.product_id = p.id
 GROUP BY p.id HAVING p.current_stock <> COALESCE(SUM(m.stock_after - m.stock_before), 0)
```

### 17.5.6 Limites e trade-offs, sem arredondar

| Limite                                      | Consequência                                                                                       |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Linha quente por produto                    | Saídas do mesmo SKU são serializadas; entre produtos distintos não há disputa                      |
| Ajuste absoluto é "último a escrever vence" | Um ajuste para 7 depois de uma entrada concorrente ignora a entrada. É a natureza de "o saldo é 7" |
| Sem chave de idempotência (D14)             | Duas requisições idênticas viram dois movimentos (§17.7.5)                                         |
| Pool de 10 conexões                         | A aprovação de inventário segura uma conexão durante toda a transação                              |
| Sem retry automático                        | Deadlock (`40P01`) vira 409 "tente novamente", nunca reexecução                                    |
| Relógio da aplicação em `created_at`        | Com mais de uma instância, os relógios podem divergir em milissegundos (I17)                       |

### 17.5.7 Política decimal: nenhum ponto flutuante em estoque

| Etapa         | Representação                       | Garantia                                                                                                                                                                                   |
| ------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Entrada HTTP  | string                              | regex de escala; mais de 3 casas é recusado                                                                                                                                                |
| Service       | `Prisma.Decimal`                    | só métodos do `Decimal`; proibido `Number()`, `parseFloat`, `+x`, `Math.*`, `.toNumber()`                                                                                                  |
| SQL           | parâmetro string com `::numeric`    | aritmética em `numeric`                                                                                                                                                                    |
| Agregação     | `SUM(...)::text`, `COUNT(...)::int` | §17.5.4                                                                                                                                                                                    |
| Resposta HTTP | string na escala da coluna          | serializador global; campos derivados registrados em `DECIMAL_FIELD_SCALES` (`divergence`, `movedSinceCount`, `appliedDelta`, `derivedStock`, `deficit`, `totalQuantity`, `netDivergence`) |

**Quatro proteções que não dependem de revisão:** (1) regra de lint com escopo nos
`*.service.ts`, `*.sql.ts` e `quantity.ts`, sem permitir supressão; (2) **vetores contra
referência em `BigInt`** (semente fixa, sem dependência nova), incluindo `0.1 + 0.2`,
`0.001`, `99999999999.999` e zero; (3) integração com sequências que em `number` errariam;
(4) **evidência por mutação**: trocar o `Decimal` do helper por `Number` e registrar que (2) e
(3) ficam vermelhos.

## 17.6 Inventário (marco 5B)

### 17.6.1 Estados e transições

```
OPEN ──► COUNTING ──► PENDING_APPROVAL ──► APPROVED
  └──────────┴────────────────┴───────────► CANCELLED
```

`APPROVED` e `CANCELLED` são **terminais, garantido pelo banco** (trigger, `SF002`).
`PENDING_APPROVAL` ainda **retém** os produtos. Toda transição é um `UPDATE` condicionado ao
estado de origem na cláusula `WHERE`; zero linhas leva a uma leitura na mesma transação que
escolhe o código (`INVENTORY_NOT_OPEN`, `INVENTORY_ALREADY_APPROVED` ou
`INVENTORY_INVALID_STATE`).

### 17.6.2 Um inventário não finalizado por produto (D2), no PostgreSQL

**Mecanismo recomendado (D17):** a coluna `in_progress` em `inventory_items` e um **índice
único parcial** sobre ela, com **dois triggers**. A análise completa contra a tabela de
reserva está na §17.8.6.

```sql
ALTER TABLE inventory_items ADD COLUMN in_progress boolean NOT NULL DEFAULT true;
CREATE UNIQUE INDEX inventory_items_one_unfinalized_per_product
  ON inventory_items (product_id) WHERE in_progress;
-- trigger 1 (AFTER UPDATE OF status, ao virar APPROVED/CANCELLED): in_progress = false nos itens
-- trigger 2 (BEFORE UPDATE OF status, saindo de APPROVED/CANCELLED): recusa, SQLSTATE SF002
```

Como `in_progress` nasce `true`, **qualquer** `INSERT` de item em inventário aberto é coberto
pelo índice, sem protocolo da aplicação. **A abertura**, em uma transação:

```
1. pg_advisory_xact_lock(<chave de inventario>)      -- só para gerar o code (D15); NAO faz parte da garantia
2. INSERT inventories (code INV-AAAA-NNNN = MAX do ano + 1, status OPEN)
3. INSERT inventory_items ... SELECT ... FROM unnest(ids, productIds) ORDER BY product_id
        ON CONFLICT (product_id) WHERE in_progress DO NOTHING RETURNING product_id
4. se (inseridos) < (pedidos): lê quem retém e lança PRODUCT_IN_OPEN_INVENTORY -> a transacao desfaz tudo
5. auditoria dentro da transação
```

`ORDER BY product_id` evita ciclo de espera entre aberturas que se sobreponham.

**Medido** (SQL com duas sessões, e depois pelo Prisma em `$transaction` reais):

| Concorrência                                                       | Resultado                                                                                                |
| ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| Duas aberturas com produto em comum                                | uma abre; a outra **espera o commit** e é recusada; **nenhum inventário nem item parcial** fica (Prisma) |
| **Dez** aberturas simultâneas do mesmo produto                     | **exatamente 1** sucesso e 1 inventário gravado (Prisma)                                                 |
| Abertura simultânea com o **cancelamento** do inventário que retém | a abertura **espera ~2 s o cancelamento**, depois **tem sucesso** (SQL)                                  |
| `INSERT` direto de item, sem passar pelo service                   | **o banco recusa** (`duplicate key`); a variante de tabela de reserva **aceitou** (§17.8.6)              |
| Cancelar e reabrir o produto                                       | libera e reabre (Prisma); reabrir o inventário cancelado é recusado (`SF002`)                            |

Abrir × **aprovar** concorrente usa o mesmo mecanismo do cancelamento e **é provado por teste
de integração no 5B**; não foi ensaiado separadamente. **Inventário esquecido em `OPEN` retém
os produtos até alguém cancelar** (A, M); não há expiração automática (RR-1).

### 17.6.3 Semântica do delta (D1)

- `expectedQty`: saldo do sistema no instante da **última** contagem do item, lido na mesma
  instrução que grava a contagem. `countedQty`: o que se contou. `divergence = counted − expected`,
  **congelada** na contagem.
- Na aprovação, **aplica-se a divergência ao saldo atual**. Movimentações posteriores à contagem
  são preservadas.

```
1. UPDATE inventories SET status='APPROVED', approved_by_id, approved_at, closed_at
    WHERE id=$ AND status='PENDING_APPROVAL' RETURNING ...     (0 linhas: classifica e recusa)
2. itens contados com divergencia <> 0, ORDENADOS por product_id crescente
3. para cada: UPDATE products SET current_stock = current_stock + $delta
                WHERE id=$ AND current_stock + $delta >= 0 RETURNING (before, after)
              (0 linhas: INSUFFICIENT_STOCK, a transacao desfaz TUDO)
              INSERT stock_movements (ADJUSTMENT, INVENTORY_ADJUSTMENT, quantity=|delta|, inventory_item_id)
4. auditoria da aprovacao, dentro da transacao
```

Ordem crescente de `product_id` impede ciclo de espera. O `UPDATE` do ajuste de inventário
**não exige `is_active`** (D9, §17.6.6). Teto de 200 itens, ~400 comandos, `timeout` de 30 s.

**Contagem** (`PATCH .../count`), em uma transação: (1) `UPDATE inventories SET status='COUNTING'
WHERE ... AND status='OPEN'`; (2) `SELECT ... FOR SHARE` do inventário e verificação de estado;
(3) um `UPDATE` que grava `counted_qty` e `expected_qty = current_stock` **juntos**, com busca
por `(id, inventory_id)`; (4) auditoria. **Medido pelo Prisma:** duas primeiras contagens
simultâneas terminam sem deadlock (a segunda espera a primeira); um envio simultâneo à
contagem **espera** a contagem; contagem depois do envio recebe `INVENTORY_NOT_OPEN`.

### 17.6.4 Cenários do delta, com a evidência de cada um

Saldo inicial 10, todo saldo nascido de movimentação. Cada linha é um teste do bloco de
aprovação. A coluna **Evidência** diz o que foi de fato executado: **Prisma** = rodado
pelo cliente Prisma real contra o PostgreSQL; **simulação** = coberto pela simulação exata da
§17.6.5, ainda sem execução via Prisma (vira teste de integração no 5B).

| #   | Cenário                                                            | Contagem (`expected → counted`)  | Depois da contagem  | Saldo na aprovação | Delta | Final | Resultado                                              | Evidência           |
| --- | ------------------------------------------------------------------ | -------------------------------- | ------------------- | ------------------ | ----- | ----- | ------------------------------------------------------ | ------------------- |
| S1  | Sem movimento                                                      | 10 → 8                           | nenhum              | 10                 | −2    | 8     | `8.000`                                                | **Prisma**          |
| S2  | Entrada depois, sem divergência                                    | 10 → 10                          | entrada de 5        | 15                 | 0     | 15    | **0 ajustes**, `15.000`                                | **Prisma**          |
| S3  | Entrada depois, com divergência                                    | 10 → 8                           | entrada de 5        | 15                 | −2    | 13    | `13.000` = 8 + 5                                       | **Prisma**          |
| S4  | Saída depois                                                       | 10 → 8                           | saída de 3          | 7                  | −2    | 5     | `5.000` = 8 − 3                                        | **Prisma**          |
| S5  | Divergência positiva                                               | 0 → 5                            | nenhum              | 0                  | +5    | 5     | igual à contagem                                       | simulação           |
| S6  | **Delta levaria a saldo negativo**                                 | 10 → 4                           | saída de 9          | 1                  | −6    | n/a   | **recusado**, saldo 1, `PENDING_APPROVAL`, item retido | **Prisma**          |
| S7  | **Recontagem** com entrada entre as duas                           | 1ª 10→8; entrada 2; 2ª **12→10** | nenhum              | 12                 | −2    | 10    | `expected` re-congelado em 12; correto                 | simulação           |
| S8  | Recontagem sem movimento                                           | 10→8, depois 10→9                | nenhum              | 10                 | −1    | 9     | a última vence                                         | simulação           |
| S9  | **Movimento registrado depois de algo que veio fisicamente antes** | 10 → 12                          | entrada de 2 depois | 12                 | +2    | 14    | **divergência dupla** (ver §17.6.7)                    | simulação           |
| S10 | Item não contado                                                   | `NULL`                           | qualquer            | qualquer           | n/a   | igual | ignorado (a consulta filtra `counted_qty IS NOT NULL`) | **Prisma** (filtro) |
| S11 | Delta que estoura `numeric(14,3)`                                  | 0 → 5 sobre `99999999999.000`    | nenhum              | 99999999999.000    | +5    | n/a   | **422** (`22003`), nada aplicado, `PENDING_APPROVAL`   | **Prisma**          |

**Saldo negativo (S6):** o `UPDATE` condicionado devolve 0 linhas, a transação desfaz tudo e
o inventário **fica em `PENDING_APPROVAL`** (medido). A resposta é 409 `INSUFFICIENT_STOCK`
com `productId`, `inventoryItemId`, `available`, `requested`, `expectedQty` e `countedQty`, e
uma consulta na mesma transação lista **todos** os itens que hoje levariam o saldo abaixo de
zero. O operador registra o movimento que falta e aprova de novo, ou cancela e refaz. **Não
existe "voltar à contagem"** (RR-6).

### 17.6.5 A semântica é consistente: simulação exaustiva

Simulação com **aritmética exata** (`BigInt` em milésimos, semente fixa), 200.000 sequências
aleatórias por modo, com até 3 contagens por item e movimentos antes, entre e depois delas:

| Modo                                                                   | Sequências | Resultado                                                                                                                |
| ---------------------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------ |
| **Simultâneo** (cada movimento é registrado quando ocorre)             | 200.000    | **saldo final = estoque físico real em 100%**; reconciliação sempre fecha; **nenhum saldo negativo**; **nenhuma recusa** |
| **Atrasado** (S9: entrada física antes da contagem, registrada depois) | 200.000    | **erro de saldo = exatamente o valor registrado com atraso, em 100%**; reconciliação ainda fecha                         |

Duas conclusões. **(1)** Quando os movimentos são registrados no momento em que acontecem, o
delta é **exato**; a recusa por saldo negativo (S6) só ocorre quando o sistema e a realidade já
divergem por um registro errado, ou seja, ela é um **detector de inconsistência**, não um
falso alarme. **(2)** O erro do S9 não é imprevisível: vale **exatamente** o líquido do que foi
registrado depois de ter ocorrido antes. É um limite do método, não um defeito de código, e o
procedimento operacional da §17.6.7 o evita.

### 17.6.6 D9: ajuste de inventário em produto inativo, restrito

**Aprovado exclusivamente para ajustes decorrentes de reconciliação de inventário.** Entrada,
saída e ajuste manual **continuam recusando produto inativo** (409). A exceção existe só no
caminho da aprovação, e vem com:

- **RBAC:** só A e M aprovam (OPERATOR recebe 403 antes da busca); só A e M abrem inventário,
  portanto só eles incluem produto inativo na seleção.
- **Auditoria:** a abertura e a aprovação registram, no snapshot, a lista de **produtos
  inativos** incluídos e ajustados.
- **Testes:** aprovação ajusta produto inativo (200); `IN`, `OUT` e ajuste manual no mesmo
  produto devolvem 409; OPERATOR não aprova (403); a auditoria lista o produto inativo.

### 17.6.7 D18: movimentação durante o inventário e o risco S9 (aceitos, provisórios)

**Decisão:** a movimentação **continua permitida** em produto que está em inventário. O risco
S9 é **aceito provisoriamente**. Documentação explícita:

**O que acontece.** Se uma entrada ocorreu fisicamente **antes** da contagem mas só foi
registrada **depois**, a contagem já a incluía e o registro posterior a soma de novo. O saldo
final fica **maior que o físico exatamente nesse valor** (medido). O sistema **não detecta**
isso sozinho.

**O que o sistema faz para reduzir o dano:** `movedSinceCount` e `movementsSinceCount` no
detalhe, **antes** da aprovação; `appliedDelta` e `movedSinceCount` na resposta da aprovação;
auditoria de cada contagem (com a anterior) e da aprovação; `/reports/divergences` expõe o
`movedSinceCount` gravado.

**Procedimento operacional para evitar o S9** (a ser reproduzido no README e na tela, Fase 6):

1. **Registre todos os movimentos físicos pendentes ANTES de contar o produto.** Nada que já
   aconteceu na prateleira pode ficar sem lançamento durante a contagem.
2. **Evite movimentar** (física e no sistema) os produtos enquanto são contados.
3. **Antes de enviar, confira `movedSinceCount`.** Se for diferente de zero, descubra por quê:
   se a causa é lançamento atrasado, **registre-o e RECONTE o item**. Recontar **re-congela o
   `expectedQty`** e elimina o erro (S7), mas só é possível enquanto o inventário está em
   `OPEN`/`COUNTING`.
4. **Antes de aprovar, o aprovador revisa** todo item com `movedSinceCount ≠ 0` (comparando o
   `createdAt` dos movimentos e o `referenceDoc` com a data física). Depois do envio não há
   recontagem: se houver dúvida, **cancele e reabra**.
5. **Depois de aprovar**, o relatório de divergências mostra os itens que tinham deriva, para
   conferência a posteriori.

**Condição de revisão do aceite:** se o relatório mostrar S9 recorrente, a D18 é reaberta (a
alternativa é recusar entrada e saída de produto em inventário, que a coluna `in_progress`
torna barata, ao custo de parar o depósito durante a contagem).

### 17.6.8 A aprovação simultânea não produz ajustes duplicados

Quatro travas **independentes**:

| Trava | Onde                                                          | Como impede                                                                            |
| ----- | ------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| G1    | `UPDATE inventories ... WHERE status='PENDING_APPROVAL'`      | A segunda aprovação espera o commit, reavalia o `WHERE` e recebe 0 linhas, então 409   |
| G2    | `UNIQUE (inventory_item_id)` em `stock_movements` (já existe) | Um segundo movimento do mesmo item viola o índice (`23505`)                            |
| G3    | Trigger de estado final (`SF002`)                             | Não há caminho de `APPROVED` de volta a `PENDING_APPROVAL`                             |
| G4    | Estrutura do código                                           | Só `InventoriesService.approve` aplica o delta; teste de arquitetura lê o código-fonte |

**Medido pelo Prisma: cinco aprovações simultâneas do mesmo inventário → 1 sucesso e 4
recusas (`NAO_APROVADO(APPROVED)`); exatamente 2 ajustes para 2 itens divergentes; saldos
aplicados uma única vez; um segundo ajuste direto do mesmo item foi recusado com `P2002/23505`.**

## 17.7 Segurança, auditoria, duplicatas e consistência

### 17.7.1 RBAC

Aplicado no backend por `@Roles()`, com o padrão de **negar**. A autorização acontece
**antes** da busca (OPERATOR recebe 403, não 404).

| Ação                                                 | A   | M   | O   | Marco |
| ---------------------------------------------------- | --- | --- | --- | ----- |
| Entrada e saída                                      | ✓   | ✓   | ✓   | 5A    |
| **Ajuste manual**                                    | ✓   | ✓   | ✗   | 5A    |
| Ler movimentações, dashboard e relatórios de estoque | ✓   | ✓   | ✓   | 5A/5B |
| Abrir inventário                                     | ✓   | ✓   | ✗   | 5B    |
| Contar e enviar                                      | ✓   | ✓   | ✓   | 5B    |
| **Aprovar** e cancelar inventário                    | ✓   | ✓   | ✗   | 5B    |
| Relatórios `inventories` e `divergences`             | ✓   | ✓   | ✗   | 5B    |
| **Reconciliação**                                    | ✓   | ✗   | ✗   | 5B    |

### 17.7.2 Entrada

`userId` do token; `type` da rota; campos de saldo e de data recusados; `note` e
`referenceDoc` armazenados como texto; todo SQL cru com template tagged; enums pelo Prisma.

### 17.7.3 Auditoria transacional (D3, aprovada)

| Elemento                         | Mudança                                                                                                                               |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `buildAuditData(input)`          | Extraído do `record()` atual. **Único** ponto que monta o registro e chama `toAuditSnapshot` (a redação)                              |
| `record(input)`                  | **Inalterado**: cliente global, fora de transação, nunca lança, loga a falha. Usado pelos cadastros da Fase 4                         |
| `recordInTransaction(tx, input)` | **Novo.** `tx.auditLog.create`, **sem `try/catch`**: a falha propaga e desfaz a transação. Exige autor; sem autor, erro interno (500) |

Operações com auditoria obrigatória: **5A**, `STOCK_MOVEMENT_CREATED` (entrada, saída e ajuste
manual). **5B**, `INVENTORY_OPENED`, `INVENTORY_COUNT_RECORDED` (guarda a contagem anterior em
`before`), `INVENTORY_SUBMITTED`, `INVENTORY_APPROVED` e `INVENTORY_CANCELLED`.

**Regressão da Fase 4 (D3):** RG-1 todos os testes existentes passam **sem edição**; RG-2 com a
gravação da auditoria forçada a falhar, `POST /categories` continua 201 e o erro vai ao log;
RG-3 idem para `PATCH` de produto; RG-4 `record()` continua engolindo; RG-5
`recordInTransaction()` propaga; RG-6 teste de arquitetura: `stock-movements` e `inventories`
**não chamam `audit.record(`**; RG-7 o snapshot passa por `toAuditSnapshot`, com asserção sobre
o JSON gravado (sem `passwordHash`, token ou segredo).

### 17.7.4 Provas de atomicidade (saldo, movimento e auditoria)

Técnica: **injeção de falha real no banco** (trigger de teste que lança, criado e removido em
`try/finally`, com salvaguarda no `afterEach`), com **foto dos três armazenamentos antes e
depois**.

**Medido pelo Prisma:** controle sem falha confirma os três; falha injetada na **auditoria**
deixa `saldo=10, movimentos=0, auditorias=0`; falha injetada no **movimento** idem; falha no
**3º item** de uma aprovação deixa os três saldos intactos, 0 movimentos novos, o inventário em
`PENDING_APPROVAL` com os 3 itens ainda retidos, e **a nova tentativa, sem a falha, aprova
corretamente**. Em SQL, com a **conexão derrubada** (`pg_terminate_backend`) antes do commit,
nada persistiu e outra sessão nunca viu a mudança.

| #    | Marco | Operação                | Ponto de falha                                   | Esperado                                                                                           |
| ---- | ----- | ----------------------- | ------------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| AT-1 | 5A    | Saída                   | `INSERT` do movimento, depois do UPDATE do saldo | saldo, movimentos e auditorias **inalterados**; 500 no contrato único, sem vazar detalhe           |
| AT-2 | 5A    | Saída                   | auditoria                                        | idem: **o movimento também não existe**                                                            |
| AT-3 | 5A    | Entrada e ajuste manual | auditoria                                        | idem                                                                                               |
| AT-8 | 5A    | Saída                   | conexão derrubada no meio                        | saldo inalterado, nenhuma linha órfã                                                               |
| AT-9 | 5A    | **Cadastro da Fase 4**  | auditoria                                        | a operação **conclui**: o contrário do AT-2, de propósito                                          |
| AT-4 | 5B    | Aprovação               | movimento do item N (N > 1)                      | nenhum ajuste aplicado; inventário **continua** `PENDING_APPROVAL`; produtos **continuam retidos** |
| AT-5 | 5B    | Aprovação               | auditoria da aprovação                           | idem AT-4                                                                                          |
| AT-6 | 5B    | Contagem                | auditoria                                        | a contagem **não** é gravada                                                                       |
| AT-7 | 5B    | Abertura                | auditoria                                        | inventário e itens **não existem**; produtos livres                                                |

### 17.7.5 Requisições duplicadas (D14, aceita provisoriamente)

**Premissa explícita: desabilitar o botão no frontend NÃO é garantia.** É conveniência de
interface. Uma API chamável diretamente, um cliente que reenvia depois de um timeout, um
proxy que repete a requisição ou um usuário com duas abas **ignoram** o botão. Tudo abaixo é
sobre o que o **backend** garante.

**O que o backend NÃO garante (risco aceito):**

| Duplicata                                        | O que acontece                                                                       |
| ------------------------------------------------ | ------------------------------------------------------------------------------------ |
| `POST /in` repetida                              | **Dois** movimentos; o saldo **sobe duas vezes**, sem aviso (o dano silencioso)      |
| `POST /out` repetida                             | Dois movimentos, se o saldo permitir                                                 |
| Reenvio depois de a resposta se perder (timeout) | A operação **já foi confirmada**; o reenvio cria a segunda. O servidor não distingue |

**Proteções reais do backend (o que de fato existe):**

| #   | Proteção                                                                                                                                         | Efeito                                                                                                                                                 |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| P1  | **Saldo nunca negativo**, decidido atomicamente                                                                                                  | N saídas idênticas aplicam no máximo `floor(saldo ÷ quantidade)` (**medido**: 2 de 2 aplicaram sobre saldo 10; 3 de 5 sobre saldo 10 com quantidade 3) |
| P2  | **Ajuste manual absoluto**: a mesma `finalQuantity` duas vezes devolve **422 "sem efeito"** na segunda                                           | **Idempotência natural** do ajuste (**medido**: 0 linhas na repetição)                                                                                 |
| P3  | **Máquina de estados do inventário**: abrir de novo com os mesmos produtos recebe **409**; enviar, aprovar e cancelar duas vezes recebem **409** | Duplicata de inventário é segura (**medido**: aprovação ×5 = 1 sucesso e 4 recusas)                                                                    |
| P4  | Rate limit de 100 escritas/min por usuário                                                                                                       | Limita a **velocidade** do dano, não o impede                                                                                                          |
| P5  | **Trilha de auditoria** com autor, instante, IP e user-agent em cada movimento, e `referenceDoc` opcional                                        | Permite **detectar** depois, não impedir                                                                                                               |
| P6  | Correção **por novo movimento** (ajuste `CORRECTION` com nota, ou saída compensatória). Nunca edição                                             | A duplicata é reparável e a reparação fica registrada                                                                                                  |
| P7  | **Reconciliação** soma-contra-saldo                                                                                                              | Garante que o saldo bate com o histórico, **inclusive o duplicado**. Não distingue o legítimo do duplicado                                             |

**Detecção manual, procedimento (sem funcionalidade nova):** a consulta de movimentos do mesmo
usuário, produto, tipo e quantidade em janela de poucos segundos, por `referenceDoc`, aponta
candidatos. A decisão de corrigir é humana.

**Testes que comprovam o comportamento (todos de integração, PostgreSQL real):**

| #     | Marco | Teste                                                                                                          | Comprova                                                                               |
| ----- | ----- | -------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| DUP-1 | 5A    | `POST /in` idêntica duas vezes em sequência                                                                    | **os dois aplicam**, saldo +2×q (teste de caracterização)                              |
| DUP-2 | 5A    | `POST /out` idêntica duas vezes em sequência                                                                   | os dois aplicam se houver saldo                                                        |
| DUP-3 | 5A    | **N saídas idênticas simultâneas**                                                                             | sucessos = `min(N, floor(saldo ÷ q))`; **saldo nunca negativo**; movimentos = sucessos |
| DUP-4 | 5A    | Mesmo ajuste manual duas vezes                                                                                 | o segundo é **422**; um só movimento                                                   |
| DUP-5 | 5A    | **Reenvio após perda da resposta**: o cliente aborta o socket depois do envio; o servidor confirma; novo envio | **duplica** (caracteriza e documenta o risco aceito)                                   |
| DUP-6 | 5B    | Mesma abertura de inventário duas vezes, em sequência e simultâneas                                            | 1 × 201 e 1 × 409; nenhum item parcial                                                 |
| DUP-7 | 5B    | Envio e cancelamento duplicados                                                                                | o segundo é 409                                                                        |
| DUP-8 | 5B    | Aprovação duplicada, ×5 simultâneas                                                                            | **1 × 200 e 4 × 409**, ajustes uma vez                                                 |
| DUP-9 | 5B    | Mesma contagem duas vezes                                                                                      | as duas 200; estado final igual; auditoria com as duas                                 |

### 17.7.6 Consistência após falhas: o invariante que roda depois de **cada** teste

Um helper `assertStockInvariants(prisma)` roda em **`afterEach` de todo arquivo de integração
da Fase 5**, não só nos testes de falha. Ele afirma:

| #   | Invariante                                                                                                                                    | Marco |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| CI1 | **Saldo gravado = soma de (`stock_after − stock_before`)** para todo produto                                                                  | 5A    |
| CI2 | Nenhum `current_stock` negativo                                                                                                               | 5A    |
| CI3 | Todo movimento sem `inventory_item_id` tem **exatamente uma** auditoria `STOCK_MOVEMENT_CREATED`, e toda auditoria dessas tem o seu movimento | 5A    |
| CI4 | Todo item com `in_progress` pertence a inventário não finalizado, e vice-versa                                                                | 5B    |
| CI5 | Todo inventário `APPROVED` tem **exatamente um** ajuste por item contado e divergente, e nenhum por outro                                     | 5B    |

Mais, em cada cenário de falha: **a nova tentativa depois da falha aplica a operação uma única
vez** (AT-4, medido); e **a falha nunca deixa estado parcial visível a outra sessão**.

## 17.8 Banco de dados e Prisma

### 17.8.1 Duas migrations, uma por marco

| Migration                     | Marco | Conteúdo                                                                                                                                        | Depende de   |
| ----------------------------- | ----- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ------------ |
| `phase5a_stock_integrity`     | 5A    | 2 CHECKs de `stock_movements` (`balance_coherent`, `type_reason_coherent`); trigger de imutabilidade (`SF001`); pré-condição de coerência       | **D4**       |
| `phase5b_inventory_integrity` | 5B    | `expected_qty` anulável com normalização; 5 CHECKs de inventário; `in_progress`, índice único parcial e **2 triggers** (`SF002`); pré-condições | **D4 e D17** |

**Nenhuma é criada ou executada antes da sua autorização específica**, e a do 5B só depois do
5A validado. A migration do 5A **não depende da D17**. Os cinco CHECKs da Fase 2 **não são
repetidos**: verificado, cada um continua presente uma única vez.

### 17.8.2 O que a migration 5A faz

```sql
-- pré-condição: aborta com mensagem legível se existir movimento incoerente
ALTER TABLE stock_movements
  ADD CONSTRAINT stock_movements_balance_coherent CHECK (
    (type='IN'  AND stock_after = stock_before + quantity) OR
    (type='OUT' AND stock_after = stock_before - quantity) OR
    (type='ADJUSTMENT' AND stock_after <> stock_before AND quantity = abs(stock_after - stock_before))),
  ADD CONSTRAINT stock_movements_type_reason_coherent CHECK ( ...cada tipo só com os seus motivos... );
CREATE FUNCTION stock_movements_forbid_change() ... RAISE EXCEPTION ... USING ERRCODE = 'SF001';
CREATE TRIGGER stock_movements_immutable BEFORE UPDATE OR DELETE ON stock_movements FOR EACH ROW ...;
```

`type_reason_coherent` tem custo de manutenção (um motivo novo no enum exige atualizar o
CHECK), por isso tem nome próprio e pode ser descartado sem afetar o outro. `TRUNCATE`, que a
suíte usa, **continua funcionando**; apagar um inventário que já gerou ajuste é recusado, o que
é coerente com a intenção.

### 17.8.3 O que a migration 5B faz

Pré-condições (quantidade negativa, aprovação ou fechamento incoerentes, produto em mais de
um inventário não finalizado) → `expected_qty` anulável → **normalização** (`expected_qty`
nulo para itens não contados; `counted_at` preenchido para os contados) → 5 CHECKs
(`expected_qty >= 0`, `counted_qty >= 0`, pareamento dos três campos, `approval_coherent`,
`closure_coherent`) → `in_progress`, backfill, índice único parcial → 2 triggers.

**A normalização é obrigatória (achado do ensaio):** no schema antigo todo item tem
`expected_qty`; sem normalizar, o CHECK de pareamento **falharia em qualquer banco que já tivesse
um item não contado**.

### 17.8.4 Compatibilidade com dados existentes, sequência e rollback

| Aspecto                        | Evidência                                                                                                                                                                                                                                                               |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Dados existentes               | As três tabelas estão **vazias** nos dois bancos. O script também foi ensaiado com **dados populados válidos** (backfill e normalização corretos) e com **dados violadores** (recusa com mensagem, nada aplicado)                                                       |
| Aplicação                      | `prisma migrate deploy`, o mesmo comando do CI e do `globalSetup`, **ensaiado**: 5A sozinha, depois 5A + 5B em sequência, ambas aplicadas, **incluindo blocos `DO $$` e triggers**                                                                                      |
| Atomicidade                    | Um erro no meio do script **não deixa nada** (sem coluna, trigger, função nem CHECK)                                                                                                                                                                                    |
| Reversão                       | O Prisma não tem "down". Há script manual por migration, em ordem inversa (5B, depois 5A). **Ensaiado com comparação real de `pg_dump`** (665 linhas, 10 tabelas): schema **idêntico** ao original. A reversão do 5B **recusa** se houver item não contado, e é atômica |
| Registro do Prisma na reversão | A reversão manual **não apaga** o registro em `_prisma_migrations`; o procedimento (`prisma migrate resolve --rolled-back`) **não foi ensaiado** e entra no relatório do marco após teste real                                                                          |
| Travas                         | Em tabela vazia, instantâneas. Em tabela grande o padrão seria `NOT VALID` seguido de `VALIDATE CONSTRAINT` e `CREATE INDEX CONCURRENTLY`; não necessário hoje, registrado para o deploy                                                                                |

### 17.8.5 Compatibilidade com o Prisma: medida, e as guardas (item obrigatório 4)

**Medido com o Prisma 7.10.1 real**, em bancos descartáveis:

| Verificação                                                                               | Resultado                                                                                                                    |
| ----------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `migrate deploy` das duas migrations                                                      | aplicam, na ordem                                                                                                            |
| `migrate diff` banco × schema, e histórico (shadow) × schema, **com o trigram declarado** | **"No difference detected"** em **cada** etapa (só 5A; 5A + 5B), com o índice parcial e os triggers presentes                |
| Triggers e funções                                                                        | **invisíveis** ao Prisma: nunca aparecem como diferença e nunca seriam removidos por `migrate dev`                           |
| Índice único parcial **não declarado** no schema                                          | o Prisma o **ignora** (comportamento implícito, verificado em 7.10.1); não aparece no diff                                   |
| Índice único parcial **declarado**                                                        | **exige o preview `partialIndexes`**, e o cliente passa a expor `productId` como chave única (enganoso). **Não será ligado** |
| `expectedQty Decimal?` e `inProgress Boolean`                                             | geram `Decimal \| null` e `boolean`; nenhum código existente referencia `InventoryItem`                                      |
| Testes existentes                                                                         | `health.int-spec` usa `arrayContaining` (tabelas e CHECKs); a regex de `decimal-scale.spec` já aceita `Decimal?`             |

**D19, nova: declarar o índice trigram no `schema.prisma`** (`@@index([name(ops:
raw("gin_trgm_ops"))], type: Gin, map: "products_name_trgm_idx")`). **Só schema, nenhuma
mudança de banco.** Elimina a deriva que existe hoje (I18) e torna o `migrate dev` seguro para o
índice de busca. Medido: com isso, o drift vai a **zero**.

**Guardas, todas por teste ou por regra (nenhuma por boa vontade):**

| #    | Guarda                                                                                                                                                                                                                                                      | Marco             |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- |
| PG-1 | `prisma migrate deploy` aplica em banco limpo (já é o `globalSetup` e o passo do CI)                                                                                                                                                                        | 5A, 5B            |
| PG-2 | **Teste de drift zero:** roda `prisma migrate diff --from-config-datasource --to-schema schema.prisma --exit-code` contra o banco de teste (como o `globalSetup` já chama o CLI) e exige **saída 0**. Pega qualquer divergência futura entre schema e banco | 5A (após D19), 5B |
| PG-3 | **Teste de catálogo:** o índice parcial existe **com a definição exata**; os triggers existem; os CHECKs existem. Se um futuro `migrate dev` removesse o índice, o CI **falharia**                                                                          | 5A, 5B            |
| PG-4 | **Teste de mapeamento de erro:** os `SQLSTATE` `SF001`/`SF002` chegam como `originalCode` pelo helper `pgErrorCode`, nunca como `P2003`                                                                                                                     | 5A, 5B            |
| PG-5 | **Não ligar `partialIndexes`**; comentário no `schema.prisma` explicando por que o índice parcial não é declarado                                                                                                                                           | 5B                |
| PG-6 | **Checklist de upgrade do Prisma** (R3): refazer o drift, confirmar que o índice parcial continua ignorado, e que os códigos `P2039` e `originalCode` não mudaram. A versão é fixada exata, então a atualização é sempre deliberada                         | 5A, 5B            |
| PG-7 | README: migrations da Fase 5 são **SQL escrito à mão e revisado**, aplicadas por `migrate deploy`                                                                                                                                                           | 5A, 5B            |
| PG-8 | `prisma generate` no CI (já existe) e `typecheck` pegam qualquer consumidor de `expectedQty` que ignore o `null`                                                                                                                                            | 5B                |

### 17.8.6 D17: a alternativa de tabela de reserva, comparada e medida

**Pedido:** comparar a reserva de produtos em inventário por **tabela separada com índice
único** (variante **R**) com a coluna `in_progress` e índice único parcial (variante **A**),
avaliando simplicidade, manutenção, integridade e impacto no Prisma, e recomendar uma solução
definitiva. As duas foram **implementadas em bancos descartáveis, aplicadas por `migrate
deploy` e exercitadas**.

| Critério                                 | **A-mín**: coluna `in_progress` + índice parcial + 2 triggers                                                                        | **R**: tabela `inventory_reservations` (PK = produto) + 2 triggers                                                                             |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Objetos novos                            | 1 coluna, 1 índice, 2 triggers                                                                                                       | 1 tabela (PK, 2 FKs, 1 índice), 2 triggers. **+1 trigger** para igualar a integridade da A                                                     |
| **Integridade: abertura concorrente**    | ✓ uma abre, a outra espera e é recusada (SQL e Prisma, 10 simultâneas = 1)                                                           | ✓ idêntico (a PK usa o mesmo mecanismo de espera por tupla)                                                                                    |
| **Integridade: abertura × cancelamento** | ✓ espera e depois abre                                                                                                               | ✓ idêntico (o trigger apaga a reserva)                                                                                                         |
| **Integridade: `INSERT` direto de item** | **✓ o banco recusa** (`duplicate key`), porque o índice está sobre a **própria linha** que representa "produto em inventário"        | **✗ o banco ACEITOU** o segundo item: ficaram **2** inventários não finalizados para o mesmo produto. Só um terceiro trigger fecharia a lacuna |
| Fontes de verdade                        | **Uma** (a linha do item)                                                                                                            | **Duas** (item e reserva), que precisam ficar sincronizadas por protocolo ou por trigger                                                       |
| Liberação (encerrar e cancelar)          | Trigger muda um booleano nos itens                                                                                                   | Trigger apaga as linhas de reserva                                                                                                             |
| Impacto no Prisma                        | **Drift zero** (ensaiado). O índice parcial é **ignorado** quando não declarado; declarar exige preview e gera `findUnique` enganoso | **Drift zero**. 100% declarativo e GA (`@id`), **sem** preview. Adiciona um modelo e relações em `Product` e `Inventory`                       |
| Impacto nos testes existentes            | Nenhum                                                                                                                               | Adiciona uma 10ª tabela (o teste usa `arrayContaining`, sem quebra)                                                                            |
| Manutenção                               | Índice invisível ao Prisma: **depende de PG-2, PG-3 e PG-6** para não ser removido por descuido                                      | Tudo visível no schema; menos dependência de comportamento implícito do Prisma                                                                 |
| Backfill e reversão                      | 1 `UPDATE`; reversão em 1 `DROP COLUMN`                                                                                              | 1 `INSERT ... SELECT`; reversão em 1 `DROP TABLE`                                                                                              |

**Recomendação definitiva: A-mín.**

**Justificativa técnica.** (1) **Integridade:** em A o índice está sobre a **própria linha** do
item, então não existe caminho de escrita que crie um item em andamento sem passar pela
garantia. Em R, **provado**, um item inserido sem a reserva viola a regra; fechar isso exige um
trigger a mais, que faz R **ter mais objetos que A para a mesma garantia**. (2) **Simplicidade:**
A não cria tabela, FKs, relações no Prisma nem uma segunda fonte de verdade. (3) **Prisma:** o
único ponto a favor de R é ser declarativo, e o risco correspondente em A (o Prisma ignorar um
índice não declarado) está **medido**, **fixado pela versão exata** e **coberto por três
guardas** (PG-2, PG-3, PG-6) que fariam o CI falhar antes de qualquer perda. (4) O custo real
de A, não ligar o preview, é uma **escolha consciente** e documentada.

**Se você preferir R:** é uma solução correta e totalmente declarativa, **com um terceiro
trigger** (reserva automática no `INSERT` do item) para igualar a integridade da A. A
concorrência e a liberação já foram **ensaiadas** e funcionam. O custo é uma tabela, duas FKs e
duas relações no Prisma a mais, sem ganho de garantia. Posso trocar o plano sem retrabalho do
restante (o resto da §17.6 não muda).

### 17.8.7 Índices

Os existentes cobrem as consultas da fase: `(product_id, created_at DESC)`,
`(created_at DESC)`, `(type, created_at DESC)` e `(status, started_at DESC)`. O único índice
novo é o parcial da D17. Plano de consulta é da Fase 7.

### 17.8.8 Evidência colhida nesta revisão, e o que continua sem prova

Em bancos criados com `CREATE DATABASE ... TEMPLATE stockflow_test` e **removidos ao final**
(conferido: nenhum banco `phase5*` restante, **0 movimentos, 0 inventários, 0 triggers, 5
CHECKs e 1 migration** nos bancos reais). O código de ensaio ficou **fora do repositório**,
com um _junction_ temporário para `node_modules` já removido sem tocar no alvo. Nenhum arquivo
foi criado no repositório além deste documento.

| Ensaio                                                                                | Resultado                                                           |
| ------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| Dados existentes; CHECKs e triggers atuais                                            | vazias; exatamente 5 CHECKs; 0 triggers                             |
| Migrations 5A e 5B por `prisma migrate deploy`; drift em cada etapa                   | aplicam; **No difference detected** (banco e histórico)             |
| Reversão 5B e 5A, `pg_dump` com conteúdo real                                         | schema **idêntico**                                                 |
| Pré-condições com dados violadores; banco populado válido                             | recusa legível, nada aplicado; backfill e normalização corretos     |
| Recusas de CHECK e imutabilidade (`UPDATE`, `DELETE`; `TRUNCATE` livre)               | todas recusadas, `TRUNCATE` funciona                                |
| D2 com sessões concorrentes (SQL) e **10 aberturas via Prisma**                       | como §17.6.2                                                        |
| Saída, entrada, ajuste com CTE, nos dois sentidos; **5 saídas via Prisma**            | como §17.5.2                                                        |
| Atomicidade com falha injetada (**via Prisma**) e conexão derrubada (SQL)             | como §17.7.4                                                        |
| Delta S1 a S4, S6 e S11, aprovação ×5, ajuste duplo, falha no 3º item, **via Prisma** | como §17.6.4 e §17.6.8 (S5, S7, S8 e S9 só pela simulação, §17.6.5) |
| Simulação do delta, 2 × 200.000 sequências em aritmética exata                        | como §17.6.5                                                        |
| Tipos e erros pelo Prisma (`Decimal`, `bigint`, `P2039`, `P2003`, `22003`, `SF001`)   | como §17.5.4 e I19                                                  |
| Variante R: concorrência e bypass de `INSERT` direto                                  | como §17.8.6                                                        |

**O que o ensaio NÃO cobre, dito sem arredondar:** o **código do projeto** (os services ainda
não existem; os ensaios usaram scripts equivalentes); a rota HTTP e o pipeline completo
(guards, filtros, throttler); o **abrir × aprovar** concorrente; o procedimento `migrate
resolve` após falha de migration; o `SF002` pelo ORM (só o `SF001` foi medido; o mecanismo é o
mesmo); a carga com milhares de produtos; e **o comportamento do abort do Node 24 sob a suíte
maior**. Tudo isso é prova dos blocos de implementação, com teste.

## 17.9 Seed idempotente e seguro (D13, marco 5B)

**Condição aprovada:** o seed com movimentações pelo service real, **seguro e idempotente**.

| Propriedade               | Como é garantida                                                                                                                                                                                                  | Teste                                                                                             |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| **Pelo service**          | Usa `StockMovementsService`, nunca `INSERT` direto, então não pode gerar estado que a regra recusaria. O ator da auditoria é definido explicitamente (`auditContextStorage.run`) com os usuários do seed          | Reconciliação aprova o resultado                                                                  |
| **Idempotente**           | Cada movimento planejado tem `referenceDoc` determinístico (`SEED-<sku>-<n>`). **Antes de criar, verifica se já existe**; se existe, pula. Um seed interrompido **se completa** na próxima execução, sem duplicar | Rodar o seed **duas vezes**: mesmas contagens e saldos; rodar após interrupção simulada: completa |
| **Determinístico**        | Gerador pseudoaleatório com **semente fixa**; mesmas quantidades em toda máquina                                                                                                                                  | Dois ambientes limpos produzem o mesmo histórico                                                  |
| **Seguro**                | Mantém a **guarda de produção** existente (recusa `NODE_ENV=production`); só usa `.env` de desenvolvimento; senhas por variável de ambiente                                                                       | Teste: com `NODE_ENV=production` o seed **recusa** e não grava nada                               |
| **Fictício**              | Toda movimentação traz `note` "dado fictício de demonstração", e o README declara que **nenhum dado é real**. Sem nome de empresa, cliente ou processo de terceiros                                               | Asserção sobre o `note` e o prefixo `SEED-`                                                       |
| **Atômico por movimento** | Cada movimento é uma transação do service (saldo, movimento e auditoria juntos)                                                                                                                                   | Reconciliação e CI3 após o seed                                                                   |

Limite assumido: a idempotência é **por `referenceDoc`**, que não é único no banco; dois seeds
**simultâneos** poderiam duplicar. Seed concorrente não é cenário suportado, e isso fica
escrito no seed.

## 17.10 Dependências e arquivos

**Dependências: nenhuma.** O ensaio usou só o Prisma CLI e o cliente já instalados; o teste por
vetores usa gerador próprio.

**Marco 5A: criar**

```
src/stock-movements/{module,controller,service,service.spec,sql}.ts
src/stock-movements/dto/{create-movement,create-adjustment,query-movements,movement}.dto.ts
src/common/errors/stock.errors.ts          # InsufficientStock, ProductInactive, InvalidTypeReason
src/common/utils/{movement-rules,quantity,pg-error}.ts   # pgErrorCode (originalCode)
test/{stock-movements,concurrency,atomicity,duplicates,db-integrity-5a,prisma-compat}.int-spec.ts
test/helpers/{failure-injection,invariants}.ts
src/architecture.spec.ts
prisma/migrations/<data>_phase5a_stock_integrity/migration.sql      # só com autorização
```

**Marco 5A: modificar** `app.module.ts`, `error-codes.ts`, `not-found.errors.ts`,
`decimal-scale.ts`, `audit/audit.service.ts` (`buildAuditData`, `recordInTransaction`, 1 ação),
`products.controller.ts` e `products.module.ts`, `prisma/schema.prisma` (**só o índice
trigram, D19**), `eslint.config.mjs`, `contract.int-spec.ts` (31 → 37), `rbac.int-spec.ts`,
`roles.guard.spec.ts`, `audit.int-spec.ts`.

**Marco 5B: criar** `src/{inventories,reports,dashboard}/` (module, controller, service, sql, dto),
`src/common/errors/inventory.errors.ts`, `test/{inventories,inventory-exclusivity,reports,
reconciliation,seed,db-integrity-5b}.int-spec.ts`, e
`prisma/migrations/<data>_phase5b_inventory_integrity/migration.sql` (só com autorização).
**Modificar** `schema.prisma` (`expectedQty` opcional, `inProgress`), `prisma/seed.ts`,
`audit.service.ts` (5 ações), `contract.int-spec.ts` (37 → 53), `rbac.int-spec.ts`.

**Documentação, ao fim de cada marco:** relatório do marco (`docs/18-relatorio-fase-5.md`,
parcial no 5A e completo no 5B), e no 5B o **ADR-0006**, o adendo ao ADR-0003 e a atualização
de `02`, `04`, `05`, `07`, `08` e `09`. **Frontend: nenhum arquivo, nos dois marcos.**

## 17.11 Ordem de implementação

Cada bloco só começa depois que o anterior roda, **com seus testes**.

### Marco 5A: movimentações, regras de estoque, transações, concorrência e imutabilidade

| #   | Bloco            | Conteúdo                                                                                                                                                               | Depende de |
| --- | ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| A1  | Fundação         | Erros, `movement-rules`, `quantity`, `pgErrorCode`, `recordInTransaction`, regra de lint, **D19** (trigram + guarda de drift), **migration 5A** com as provas de banco | nenhum     |
| A2  | Núcleo de saldo  | Entrada, saída e ajuste, controller, DTOs; **spikes restantes** do service real (tipo do `numeric`, erro por `originalCode`)                                           | A1         |
| A3  | Provas           | **Barreira**: teste central CC-1, variantes, entrelaçamento, **atomicidade AT-1 a AT-3, AT-8, AT-9, duplicatas DUP-1 a DUP-5, invariantes CI1 a CI3**, mutação ingênua | A2         |
| A4  | Consultas        | Listagem, detalhe, `GET /products/:id/movements`, filtros, paginação                                                                                                   | A2         |
| A5  | Fechamento do 5A | RBAC, contrato de 37 rotas, volume de ~200 movimentos pelo service, documentação, **relatório parcial**, revisão                                                       | A3, A4     |

### Marco 5B: inventários, dashboard, relatórios e seed (só depois da validação do 5A)

| #   | Bloco                  | Conteúdo                                                                                                                                | Depende de |
| --- | ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| B1  | Inventário, ciclo      | **Migration 5B** (D17), abertura (código e exclusividade), detalhe, contagem, envio, cancelamento; AT-6, AT-7, DUP-6, DUP-7, DUP-9, CI4 | 5A         |
| B2  | Aprovação              | Aprovação por delta, S1 a S11, DUP-8, AT-4, AT-5, D9, CI5                                                                               | B1         |
| B3  | Relatórios e dashboard | 6 rotas de relatório e 3 do dashboard; **reconciliação** como rota                                                                      | 5A, B2     |
| B4  | Seed                   | Seed idempotente e seguro pelo service (§17.9)                                                                                          | 5A         |
| B5  | Fechamento do 5B       | RBAC, contrato de 53 rotas, ADR-0006, adendo ao ADR-0003, documentação, **relatório final**, revisão                                    | tudo       |

## 17.12 Estratégia de testes

Mais integração que unitário, porque as invariantes vivem no banco. **Barreira determinística
para concorrência, sem `sleep`:** a segunda requisição só é liberada depois que `pg_locks`
mostra uma espera **não concedida**.

### Marco 5A: testes obrigatórios

| Grupo            | Ids                      | O que precisa estar provado                                                                                                                                                                                                                         |
| ---------------- | ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Movimentação     | MV-1 a MV-n              | Entrada/saída/ajuste com `before`/`after` reais; combinação inválida 422; produto inativo e inexistente; ajuste sem efeito 422; overflow 422; mass assignment por campo; sem `PATCH`/`DELETE`                                                       |
| **Concorrência** | **CC-1 a CC-7**          | **CC-1: 5 saídas de 3 sobre saldo 10 = 3 × 201, 2 × 409, saldo 1, 3 movimentos.** CC-2 20×1; CC-3 misto; CC-4 entrelaçamento por `pg_locks`; CC-5 ajuste × saída nos dois sentidos; CC-6 saída × inativação; **CC-7 a implementação ingênua FALHA** |
| **Atomicidade**  | AT-1, 2, 3, 8, 9         | §17.7.4                                                                                                                                                                                                                                             |
| Regressão Fase 4 | RG-1 a RG-7              | §17.7.3                                                                                                                                                                                                                                             |
| **Duplicatas**   | **DUP-1 a DUP-5**        | §17.7.5                                                                                                                                                                                                                                             |
| **Invariantes**  | CI1 a CI3 em `afterEach` | §17.7.6                                                                                                                                                                                                                                             |
| Decimal          | DEC-1 a DEC-4            | vetores `BigInt`, sequências exatas, campos derivados registrados, **mutação por `Number` falha**                                                                                                                                                   |
| Corpo            | BD-1 a BD-3              | orçamento de bytes de todos os DTOs; 413 acima de 16 KiB                                                                                                                                                                                            |
| Banco            | DBI-1 a DBI-n            | CHECKs de coerência recusam cada incoerência; `UPDATE`/`DELETE` recusados com `SF001`; `TRUNCATE` livre; **os 5 CHECKs da Fase 2 uma vez cada**                                                                                                     |
| **Prisma**       | PG-1 a PG-4, PG-6        | §17.8.5                                                                                                                                                                                                                                             |
| RBAC e contrato  | rotas do 5A              | 401, 403 por papel, autorização antes da busca; **37 rotas**                                                                                                                                                                                        |
| Volume           | RC-1                     | ~200 movimentos aleatórios **pelo service**: CI1 a CI3 fecham                                                                                                                                                                                       |

### Marco 5B: testes obrigatórios

| Grupo                  | Ids                        | O que precisa estar provado                                                                                                                                                    |
| ---------------------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Exclusividade (D2)     | EX-1 a EX-8                | A matriz da §17.6.2, linha a linha; **`INSERT` direto recusado pelo banco**; abrir × aprovar                                                                                   |
| Inventário             | INV-1 a INV-n              | Ciclo; cada transição inválida com o código certo; item de outro inventário 404; `expectedQty` congelado; contagens simultâneas coerentes                                      |
| **Aprovação**          | **AP-1 a AP-4**            | **AP-1: S1 a S11.** **AP-2: 5 aprovações simultâneas = 1 × 200 e 4 × 409.** AP-3: segundo ajuste do mesmo item recusado (G2). AP-4: aprovação × saída concorrente sem deadlock |
| D9                     | D9-1 a D9-4                | §17.6.6                                                                                                                                                                        |
| Atomicidade            | AT-4 a AT-7                | §17.7.4                                                                                                                                                                        |
| Duplicatas             | DUP-6 a DUP-9              | §17.7.5                                                                                                                                                                        |
| Invariantes            | CI4, CI5 em `afterEach`    | §17.7.6                                                                                                                                                                        |
| Corpo                  | BD-4 a BD-6                | 201 com o pior caso de ~10,6 KiB; 400 com 201 ids; 413 acima de 16 KiB                                                                                                         |
| Banco e Prisma         | DBI-n, PG-1 a PG-8         | CHECKs de inventário, `NULL` em `expected_qty`, pareamento, índice parcial, estado final terminal; drift zero                                                                  |
| Reconciliação          | RC-2, RC-3                 | A rota fecha limpa no cenário normal e **detecta** saldo adulterado por SQL direto; cenário de ~200 movimentos com aprovação no meio                                           |
| Relatórios e dashboard | RP-1 a RP-n, DSH-1 a DSH-n | Valores calculados à mão; estado vazio com zeros; `COUNT` nunca `BigInt`; `days`/`limit` fora da faixa 400                                                                     |
| **Seed**               | SD-1 a SD-5                | §17.9: **idempotente, determinístico, recusa produção, fictício, reconciliação aprova**                                                                                        |
| RBAC e contrato        | rotas do 5B                | Reconciliação só A; `inventories` e `divergences` só A e M; **53 rotas**                                                                                                       |
| Regressão do 5A        | todos do 5A                | **Nada do 5A regrediu**                                                                                                                                                        |

### CI Linux e a pendência local do Node 24

- O CI **não muda**: o job `Backend` já sobe PostgreSQL 17, aplica as migrations e roda
  `npm run test:int`. O resultado **autoritativo** de cada marco é o do Linux.
- **A instabilidade do Node 24 no Windows continua documentada e não resolvida**
  (10% a 35% das execuções, §16.11.6). Com a suíte maior, é razoável esperar mais ocorrências
  locais, e cada marco as **conta**.
- **Sem retry, sem teste desativado, sem `--bail`, sem aumento de timeout para esconder
  falha.** Execução local com `Errors` no rodapé **não é verde**.
- **Vale também para o CI:** uma execução que falhe é registrada; rodar de novo é **para
  diagnosticar**, nunca para obter verde. Teste que passa só na segunda tentativa é defeito.
- Em desenvolvimento, rodar o arquivo em que se trabalha reduz a superfície de abort, sem
  substituir a execução completa antes de cada marco.

## 17.13 Riscos

### Riscos técnicos

| #      | Risco                                                                    | Mitigação                                                                                      |
| ------ | ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| R-5.1  | A semântica do delta falha em caso não previsto                          | S1 a S11 e a simulação de 400.000 sequências; S6 e S9 documentam o que o delta **não** resolve |
| R-5.2  | Deadlock na aprovação                                                    | Ordem crescente de `product_id`, D2, entrelaçamento testado, `40P01` mapeado a 409             |
| R-5.4  | Mais SQL cru amplia a superfície de injeção                              | Só template tagged, tudo em `*.sql.ts`, caso hostil por entrada                                |
| R-5.5  | Falha de log bloqueia o estoque (D3)                                     | Trade-off aprovado; `record()` dos cadastros intacto (AT-9)                                    |
| R-5.6  | Mais testes agravam o abort do Node 24                                   | CI Linux como juiz; contagem honesta; nada mascarado                                           |
| R-5.7  | Aprovação em lote segura uma conexão e uma transação longa               | Teto de 200 itens, `timeout` de 30 s, teste com 200 itens                                      |
| R-5.8  | **Atualização do Prisma muda o tratamento de índice parcial ou de erro** | Versão exata; PG-2, PG-3, PG-4 e o checklist PG-6 **falham o CI antes de qualquer perda**      |
| R-5.9  | `COUNT(*)` sem cast quebra o JSON                                        | `::int` obrigatório, teste com dado real                                                       |
| R-5.10 | Campo decimal derivado sem escala registrada                             | Lista explícita no teste de escala                                                             |
| R-5.11 | Migration falha em banco populado                                        | Normalização e pré-condições, ensaiadas com dados populados e violadores                       |
| R-5.12 | Alguém roda `prisma migrate dev` e apaga o índice de busca               | **D19** zera o drift; PG-2 e PG-3 detectam                                                     |
| R-5.13 | Defasagem de relógio entre instâncias em `created_at`                    | Documentado; UUIDv7 como desempate; reconciliação não depende de ordem                         |

### Riscos aceitos (registro)

| #    | Risco aceito                                                                                              | Quem aceitou e como                          | O que o sistema faz                                                                                                                           | Condição de revisão                                                             |
| ---- | --------------------------------------------------------------------------------------------------------- | -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| RA-1 | **Execução duplicada de entrada e saída** (D14): sem chave de idempotência                                | Responsável do projeto, **provisoriamente**  | P1 a P7 (§17.7.5); testes DUP-1 a DUP-5 **caracterizam** o comportamento; **o botão do frontend não é garantia**                              | Reabrir se uma duplicata real aparecer, ou na Fase 6 ao desenhar o cliente HTTP |
| RA-2 | **Divergência dupla por movimento fisicamente anterior à contagem e registrado depois** (D18, cenário S9) | Responsável do projeto, **provisoriamente**  | `movedSinceCount`, auditoria, relatório de divergências, **procedimento operacional** (§17.6.7); erro **exatamente quantificado** (simulação) | Reabrir se `/reports/divergences` mostrar recorrência                           |
| RA-3 | Ajuste manual absoluto é "último a escrever vence"                                                        | Implícito na D7/D8 (nota obrigatória, A e M) | Restrito a A e M; nota obrigatória; auditoria                                                                                                 | Pré-condição `expectedStock` seria funcionalidade nova                          |
| RA-4 | **Inventário esquecido em `OPEN` retém os produtos**                                                      | Implícito na D2                              | O cancelamento (A, M) libera                                                                                                                  | Expiração por tempo é fora do escopo                                            |
| RA-5 | **Limite de 200 produtos por inventário**                                                                 | D11                                          | Vários inventários disjuntos                                                                                                                  | Seleção por filtro no servidor, em fase própria                                 |
| RA-6 | **Aprovação recusada (S6) não tem "voltar à contagem"**                                                   | Implícito na D1                              | 409 com `details` completos e lista de todos os itens problemáticos                                                                           | Nova aresta de estado mudaria o contrato                                        |
| RA-7 | **Instabilidade do Node 24 no Windows**                                                                   | Responsável, na Fase 4                       | CI Linux como juiz, sem retry                                                                                                                 | Teste do script mínimo em outra linha do Node                                   |

## 17.14 Decisões

| #       | Decisão                                                         | Situação                               | Resolução                                                                                                                          |
| ------- | --------------------------------------------------------------- | -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| D1      | Aprovação de inventário por **delta**                           | **Aprovada**                           | §17.6.3 a §17.6.5, com simulação e execução via Prisma                                                                             |
| D2      | Um inventário não finalizado por produto                        | **Aprovada, com condição**             | Seguro sob concorrência real: **índice único parcial no banco**, §17.6.2. **Schema adicional: D17**                                |
| D3      | Auditoria transacional                                          | **Aprovada**                           | §17.7.3 a §17.7.4; Fase 4 preservada, com regressão                                                                                |
| D4      | Migration em partes                                             | **Aprovada, com condição**             | Compatibilidade, sequência, rollback e sem repetir os 5 CHECKs: §17.8. **Dividida em duas, uma por marco**                         |
| D5      | Códigos `INVENTORY_INVALID_STATE` e `PRODUCT_IN_OPEN_INVENTORY` | **Aprovada**                           | §17.4.3                                                                                                                            |
| D6      | 422 para "sem item contado" e "ajuste sem efeito"               | **Aprovada**                           | §17.4.1 e §17.4.3                                                                                                                  |
| D7      | `finalQuantity` e nota obrigatória (mínimo 3 caracteres)        | **Aprovada**                           | §17.4.1                                                                                                                            |
| D8      | Ajuste manual só com `CORRECTION`                               | **Aprovada**                           | §17.4.1                                                                                                                            |
| D9      | Ajuste de produto inativo                                       | **Aprovada, restrita**                 | **Somente em ajustes de reconciliação de inventário**, com RBAC e auditoria, §17.6.6                                               |
| D10     | Quatro indicadores do dashboard                                 | **Aprovada**                           | §17.4.4                                                                                                                            |
| D11     | Até 200 ids na abertura; limite de 16 KiB intacto               | **Aprovada**                           | §17.4.5                                                                                                                            |
| D12     | Dois marcos                                                     | **Aprovada, com nova divisão**         | **5A = estoque, 5B = inventário, dashboard, relatórios e seed**, §17.2                                                             |
| D13     | Seed pelo service real                                          | **Aprovada, idempotente e segura**     | §17.9                                                                                                                              |
| D14     | Sem chave de idempotência                                       | **Aceita provisoriamente**             | Risco documentado e proteções reais listadas, **sem tratar o botão do frontend como garantia**, §17.7.5; RA-1                      |
| D15     | `code` do inventário por advisory lock e `MAX + 1`              | **Aprovada**                           | §17.6.2; teste de abertura concorrente sem colisão e sem buracos                                                                   |
| D16     | Forma dos relatórios e filtros de data                          | **Aprovada**                           | §17.4.4                                                                                                                            |
| **D17** | **Schema do D2**                                                | **Aguarda a sua aprovação específica** | **Recomendação: A-mín** (coluna `in_progress`, índice parcial, 2 triggers), §17.8.6, comparada e medida contra a tabela de reserva |
| D18     | Movimentação durante inventário                                 | **Aprovada: não bloquear, provisória** | **S9 aceito provisoriamente**, com limitação e procedimento operacional documentados, §17.6.7; RA-2                                |
| **D19** | **Declarar o índice trigram no `schema.prisma`**                | **Aguarda a sua aprovação específica** | **Nova.** Só schema. Zera o drift de base do Prisma (I18) e habilita o teste de drift zero (PG-2), §17.8.5                         |

**Divergências com os ADRs:** nenhuma contradição; três **extensões** a registrar. (1) O
ADR-0003 cobre só a saída: **adendo**. (2) Delta (D1), auditoria em transação (D3) e
exclusividade garantida pelo banco (D2): **ADR-0006**. (3) A §8.5 deixa de poder dizer "dois
pontos de `$queryRaw`".

## 17.15 Critérios de aceite e condições para avançar

Cada marco **termina**, nesta ordem, com: **(1) testes**, **(2) documentação**, **(3) revisão**
e **(4) a sua autorização para commits e push**. **Os testes marcados como obrigatórios são
condição para avançar**: um marco não é declarado concluído com algum deles vermelho, pulado
ou não executado.

### Marco 5A: estoque

**Critérios funcionais:** as 6 rotas do 5A respondem conforme o §5 e o OpenAPI lista **37**;
entrada, saída e ajuste gravam `stockBefore` e `stockAfter` iguais ao saldo real; **nenhuma
sequência de operações deixa `current_stock` negativo**; `GET /products/:id/movements` devolve
o histórico do produto.

**Critérios de integridade e segurança:**

- [x] **CC-1** passa: **3 × 201, 2 × 409, saldo 1, 3 movimentos**
- [x] **CC-7**: o teste **falha** com a implementação ingênua (registrado no relatório)
- [x] Atomicidade provada em AT-1, 2, 3 (a e b) e **AT-9 preserva a Fase 4**. **AT-8 não foi
      implementado** (conexão derrubada no meio, distinto da falha por exceção já provada)
- [x] DUP-1 a DUP-5 **documentam** o comportamento aceito, e DUP-3 prova que o saldo nunca fica negativo
- [x] Invariantes CI1 (em duas partes, CI1a/CI1b) a CI3 em **`afterEach` de todo arquivo relevante**, sempre verdes
- [x] Nenhum `number` do JavaScript toca em quantidade (lint, vetores e mutação)
- [x] A migration 5A aplica em banco limpo, **reverte** com schema idêntico e **recusa** dado que a invalidaria
- [x] **Drift zero** com o Prisma (PG-2) e guarda de catálogo PG-3 verde. **PG-4 parcial**
      (unitário + caminho de overflow ponta a ponta; SF001 só pela mensagem, não há rota que
      exercite UPDATE/DELETE para provar a tradução via API). **PG-6 não se aplica** (sem
      upgrade de Prisma neste marco)
- [x] Nenhum SQL cru por concatenação; nenhuma resposta vaza SQL, stack ou nome de índice
- [x] `git status frontend/` vazio; nenhuma dependência nova; `npm audit` sem aviso novo; segredos limpos

**Condições para avançar do 5A para o 5B (todas):**

1. Todos os testes obrigatórios do 5A verdes **localmente e no CI Linux, no commit exato do fim do 5A**, com o link da execução **verificado**.
2. Evidência de CC-7 e de DEC-4 registrada.
3. Execuções locais contadas, com os abortos do Node 24 reportados como tais, **sem** retry.
4. Nenhum defeito crítico aberto; os encontrados descritos.
5. **Relatório parcial** com a saída real dos comandos, **documentação** atualizada e **revisão** do diff feita.
6. **Sua autorização explícita** para commits, push e para iniciar o 5B. Se o CI falhar, o avanço é interrompido e o erro é apresentado.

### Marco 5B: inventários, dashboard, relatórios e seed

**Critérios funcionais:** as 16 rotas do 5B respondem conforme o §5 e o OpenAPI lista **53**;
ciclo `OPEN → COUNTING → PENDING_APPROVAL → APPROVED` e `CANCELLED`; cada transição inválida
com o código definido; **a aprovação aplica o delta e preserva movimentações posteriores**;
aprovação com saldo negativo devolve 409 **sem aplicar nada** e mantém `PENDING_APPROVAL`;
dashboard e relatórios por agregação SQL, com zeros quando não há dado.

**Critérios de integridade e segurança:**

- [ ] **AP-2**: cinco aprovações simultâneas = **1 × 200 e 4 × 409**; ajustes uma única vez
- [ ] **Um produto não está em dois inventários não finalizados, garantido pelo banco** (EX-1 a EX-8, com `INSERT` direto recusado)
- [ ] Atomicidade provada em AT-4 a AT-7; invariantes CI4 e CI5 em `afterEach`
- [ ] D9 restrita ao caminho da aprovação (D9-1 a D9-4)
- [ ] Reconciliação: a rota fecha limpa e **detecta** saldo adulterado
- [ ] **Seed idempotente** (SD-1 a SD-5), recusa produção, reconciliação aprova
- [ ] Migration 5B aplica, **reverte** com schema idêntico; **drift zero** mantido
- [ ] O corpo de pior caso (~10,6 KiB) devolve 201, 201 ids devolvem 400, 16 KiB + 1 devolve 413
- [ ] **Nada do 5A regrediu**; `git status frontend/` vazio; sem dependência nova

**Condições para encerrar a fase:** CI Linux verde no último commit, **verificado**, com o link;
os três critérios do roadmap provados com saída real; **relatório final**, ADR-0006, adendo
ao ADR-0003 e `04`, `05`, `07`, `08`, `09` atualizados; limitações em aberto descritas como
estão, **incluindo o abort do Node 24**; e **sua autorização explícita** para declarar a fase
encerrada.

## 17.16 Versionamento e validação final

**Nenhum commit sem autorização.** Conventional Commits do projeto, cabeçalho de até 72
caracteres e corpo de até 100 por linha. Sequência prevista:

```
Marco 5A
chore(db): declare the trigram index in the prisma schema
feat(backend): add stock errors, type-reason rules and quantity helpers
feat(audit): record audit entries inside the business transaction
feat(db): add stock movement integrity constraints and immutability
feat(stock): add stock movements with atomic conditional updates
test(stock): prove concurrency, rollback, duplicates and the naive failure
feat(stock): add movement listing, detail and product history
test(backend): extend rbac and the contract to 37 routes
docs: add phase 5a report

Marco 5B
feat(db): add inventory integrity constraints and product exclusivity
feat(inventories): add opening, counting, submit and cancel
feat(inventories): add atomic approval by frozen delta
test(inventories): cover approval scenarios and duplicate approval
feat(reports): add reports and the stock reconciliation
feat(dashboard): add dashboard aggregates
feat(db): complete the seed through the real stock service
test(backend): extend rbac and the contract to 53 routes
docs: add phase 5 report, adr-0006 and update api notes
```

**Validação final de cada marco**, antes de pedir autorização: a bateria da §16.11 (lint,
typecheck, prettier, unitários, integração, build, `npm audit`, segredos, diff revisado, tudo
sobre **instalação limpa** com `npm ci`), mais: a evidência de que CC-1 falha com a
implementação ingênua, a mutação decimal, o **drift zero**, o schema da migration comparado
antes e depois da reversão, a contagem honesta das execuções locais de integração e o
resultado do CI Linux **verificado**.

**Nada deste documento autoriza a implementação.** Ela só começa com a sua autorização

## 17.17 Resultado real do marco 5A

Implementado, validado e autorizado para versionamento em 2026-10-26. Esta seção registra o
que de fato aconteceu, não o planejado em v3.

### Critérios funcionais

As 6 rotas aprovadas respondem: `POST /stock-movements/in`, `POST /stock-movements/out`,
`POST /stock-movements/adjustment` (ADMIN/MANAGER), `GET /stock-movements`,
`GET /stock-movements/:id`, `GET /products/:id/movements`. `stockBefore`/`stockAfter`
gravados pelo próprio `UPDATE` condicional (nunca calculados em JavaScript);
`current_stock` nunca fica negativo (garantido pelo `WHERE` da query e pelo `CHECK` do
banco, nas duas camadas); `GET /products/:id/movements` devolve lista vazia para produto
sem movimento, não 404.

### Critérios de integridade e segurança

- [x] **CC-1** passa: 3 × 201, 2 × 409, saldo final `1`, 3 movimentos — verificado três vezes
- [x] **CC-7**: a implementação ingênua ("ler → decidir → gravar") falha no mesmo cenário,
      provando que CC-1 tem dentes
- [x] Atomicidade provada em AT-1, AT-2, AT-3a, AT-3b (falha injetada real, não mock); **AT-9
      prova que a Fase 4 não regrediu** (`record()` continua engolindo falha de auditoria).
      **AT-8 (conexão derrubada no meio da saída) não foi implementado** — falha de
      transação por exceção de banco está provada (AT-1/AT-2), mas não a queda física da
      conexão; registrado como pendência, não como feito
- [x] DUP-1 a DUP-5 documentam o comportamento aceito (D14/RA-1); DUP-3 prova que N saídas
      concorrentes nunca deixam o saldo negativo
- [x] Invariantes CI1 (redesenhada em duas partes, CI1a/CI1b, para não supor saldo inicial
      zero nos fixtures de teste) a CI3 em `afterEach` de `stock-movements`, `concurrency`,
      `atomicity` e `duplicates`, sempre verdes
- [x] Nenhum `number`/`parseFloat`/`parseInt`/`Math.*`/`.toNumber()` em
      `src/stock-movements/**` ou `src/common/utils/quantity.ts` — regra de lint dedicada,
      confirmada por mutação manual (revertida)
- [x] A migration 5A aplica em banco limpo (`migrate deploy` do zero, confirmado nesta
      validação), reverteu com schema idêntico no ensaio em banco descartável, e recusa dado
      que a invalidaria (pré-condição em `DO $$ ... RAISE EXCEPTION`)
- [x] **Drift zero** com o Prisma (`prisma migrate diff --exit-code`, PG-2, confirmado contra
      banco limpo e contra os bancos reais) e guardas de catálogo PG-3 verdes. **PG-4
      parcial**: o extrator `pgErrorCode` e a constante `SF001` têm teste unitário, e o
      caminho de overflow (`22003` → 422) está provado de ponta a ponta pela API; o SQLSTATE
      `SF001` do trigger de imutabilidade é verificado pela mensagem de erro
      (`/imutável/`) no teste de banco, não por uma asserção de `originalCode` via API,
      porque nenhuma rota exposta executa UPDATE/DELETE em `stock_movements` para exercitar
      esse caminho de tradução. **PG-6 não se aplica** neste marco: nenhuma atualização de
      versão do Prisma ocorreu; o checklist fica para quando ocorrer
- [x] Nenhum SQL cru por concatenação (`$queryRaw`/`$executeRaw` com template tagging em
      todos os pontos); nenhuma resposta de erro vaza SQL, stack ou nome de índice (AT-1
      confere isso por asserção)
- [x] `git status frontend/` vazio; nenhuma dependência nova; `npm audit` sem aviso (raiz,
      backend, frontend); segredos limpos (diff e arquivos novos revisados)

### Testes executados (resultado real)

| Suíte                              | Resultado                                                             |
| ---------------------------------- | --------------------------------------------------------------------- |
| Unitários (`npm run test`)         | 199/199, 16 arquivos                                                  |
| Integração (`npm run test:int`)    | 379/379, 14 arquivos — executada **7 vezes** ao longo desta validação |
| `lint` / `typecheck` / `build`     | limpos                                                                |
| `prettier --check`                 | limpo (após correção de formatação em 16 arquivos novos/modificados)  |
| `npm audit` (raiz, backend, front) | 0 vulnerabilidades nas três árvores                                   |
| Instalação limpa                   | `migrate deploy` do zero em banco descartável + `migrate diff` = 0    |

### Instabilidade do Node 24 no Windows

Das 7 execuções completas da suíte de integração ao longo desta validação, **2 tiveram um
abort nativo do processo filho do Vitest** (`ChildProcess._handle.onexit`), não uma falha de
asserção: uma antes dos commits (13 de 14 arquivos completaram) e uma depois, sobre o estado
já commitado (343 de 379 testes completados antes do abort). Em ambos os casos a repetição
imediata, sem qualquer mudança de código, completou 379/379. Registrado como está, sem retry
automático e sem atribuir a causa a um defeito da aplicação: é a mesma instabilidade já
anotada na linha de base do §17.1, ainda não resolvida, e não resolvida por este marco. A
recorrência depois do commit mostra que não é efeito de nenhuma mudança feita durante a
validação — é intermitente, como já era antes.

### Desvios do planejado em v3

- Dois erros de teste (não de produção) foram corrigidos durante a validação: CC-5 usava
  token de sessão sem permissão para a rota de ajuste (403 inesperado); e a verificação de
  sucesso do ajuste comparava com HTTP 200 quando o endpoint devolve 201 (padrão do Nest
  para POST). Nenhuma mudança na implementação, só na asserção do teste.
- CI1 foi redesenhada em duas partes (CI1a cadeia, CI1b saldo final no último movimento)
  para não assumir que todo produto nasce com saldo zero — os fixtures de teste semeiam
  saldo inicial direto no banco, prática já usada nas Fases 2 a 4.

### Pendências e riscos para o 5B

Nenhuma pendência de escopo do 5A. A migration da D17 (A-mín: coluna `in_progress`, índice
único parcial, 2 triggers) **não foi criada nem executada**, como instruído — fica para o
início do marco 5B. A instabilidade do Node 24 no Windows continua em aberto e deve ser
reavaliada quando o CI Linux rodar por este marco.
explícita, que depende, no mínimo, da sua resposta sobre **D17** e **D19**.
