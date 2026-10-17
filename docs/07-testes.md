# 07 — Estratégia de Testes

## 7.1 Princípio

Cobertura alta em código trivial não prova nada. A estratégia aqui é **cobrir o que, se
quebrar, corrompe dados**: regra de estoque, concorrência, permissões e cálculo de
divergência. CRUD de categoria é coberto por integração, não por teste unitário de
getter.

Meta declarada: **sem percentual global de cobertura como objetivo**. O objetivo é a lista
de casos abaixo passando. O percentual será medido e reportado como informação, não como
meta a perseguir.

## 7.2 Pirâmide

```
        ┌─────────────┐
        │  E2E (2)    │  Playwright — 2 fluxos críticos
        ├─────────────┤
        │ Integração  │  Vitest + Supertest + Postgres real
        │   (~35)     │
        ├─────────────┤
        │  Unitários  │  Vitest — regra pura, sem I/O
        │   (~45)     │
        └─────────────┘
```

Proporção deliberada: mais integração do que o usual, porque as invariantes deste sistema
vivem no banco. Um teste unitário com banco mockado **não** provaria que a saída concorrente
é segura — provaria apenas que o mock foi configurado conforme a expectativa.

## 7.3 Testes unitários

Rodam sem banco, sem HTTP, sem rede.

### Regra de estoque (`stock-movements.service.spec.ts`)

| Caso                                        | Esperado                         |
| ------------------------------------------- | -------------------------------- |
| Entrada com quantidade positiva             | saldo aumenta pela quantidade    |
| Saída com saldo suficiente                  | saldo diminui pela quantidade    |
| Saída maior que o saldo                     | `InsufficientStockError`         |
| Saída igual ao saldo                        | permitida, saldo final 0         |
| Quantidade zero                             | `BadRequestException`            |
| Quantidade negativa                         | `BadRequestException`            |
| Quantidade com mais de 3 decimais           | rejeitada (precisão do schema)   |
| Produto inativo                             | `ProductInactiveError`           |
| Produto inexistente                         | `NotFoundException`              |
| `type: IN` com `reason: SALE`               | `InvalidTypeReasonError`         |
| `type: OUT` com `reason: PURCHASE`          | `InvalidTypeReasonError`         |
| `ADJUSTMENT` para quantidade final negativa | rejeitado                        |
| `ADJUSTMENT` que não muda o saldo           | rejeitado (movimento sem efeito) |

### Divergência de inventário (`inventories.service.spec.ts`)

| Caso                                     | Esperado                                |
| ---------------------------------------- | --------------------------------------- |
| contado 10, esperado 10                  | divergência 0, nenhum ajuste gerado     |
| contado 12, esperado 10                  | divergência +2, ajuste de entrada       |
| contado 8, esperado 10                   | divergência −2, ajuste de saída         |
| contado 0, esperado 5                    | divergência −5, saldo final 0           |
| contado com decimal (`7.250` vs `7.500`) | divergência `-0.250`, sem erro de float |
| item não contado (`null`)                | não entra no cálculo nem gera ajuste    |
| aprovar inventário sem itens contados    | `BadRequestException`                   |
| aprovar inventário já aprovado           | `InventoryAlreadyApprovedError`         |
| aprovar inventário cancelado             | rejeitado                               |

O caso decimal existe especificamente para falhar se alguém trocar `Decimal` por `number`.

### Permissões (`roles.guard.spec.ts`)

Matriz completa: para cada uma das ações sensíveis, assertivas de permitido/negado para os
três papéis — 3 × 8 casos. Inclui: ADMIN em tudo; OPERATOR negado em `ADJUSTMENT`, criação
de produto, abertura e aprovação de inventário, gestão de usuários e auditoria; MANAGER
negado em criação de usuário, alteração de papel e leitura do log de auditoria.

### Utilitários

Redação de campos sensíveis para o audit log (dado aninhado, array, chave em maiúsculas,
`null`), formatação de decimal, validação do DTO de paginação (`limit` acima de 100,
`page` zero ou negativa, `sort` fora da allowlist).

## 7.4 Testes de integração

Postgres real e descartável, migrations aplicadas antes da suíte, banco truncado entre
testes. App Nest instanciada de verdade via `@nestjs/testing`, com requisições por
Supertest.

### Autenticação

- login com credencial válida devolve access token e seta cookie httpOnly
- login com senha errada → 401 `INVALID_CREDENTIALS`
- login de usuário inativo → 401 `USER_INACTIVE`
- resposta de login **não contém** `passwordHash` (assertiva explícita no corpo)
- rota protegida sem token → 401
- rota protegida com token expirado → 401
- rota protegida com token assinado por outro segredo → 401
- `refresh` rotaciona o token e invalida o anterior
- reuso de refresh já rotacionado → 401 `REFRESH_TOKEN_REUSED`
- logout revoga o refresh; uso posterior → 401
- 6ª tentativa de login em 15 min → 429

### RBAC ponta a ponta

Para cada ação sensível, requisição real com token de cada papel, verificando 403 para quem
não pode. Isso testa o que _de fato_ protege o sistema — a matriz da §7.3 testa o guard
isolado; esta testa o guard montado na rota, que é onde erro de decorator aparece.

### Produtos

- SKU duplicado → 409 `SKU_ALREADY_EXISTS`
- SKU é normalizado para uppercase
- `currentStock` enviado no `PATCH` → 400 (campo não permitido)
- `limit=500` é limitado a 100
- `sort=password` (fora da allowlist) → 400
- filtro `stockStatus=low` retorna exatamente os produtos com `0 < stock <= minStock`
- inativar produto preserva suas movimentações
- paginação: `total` e `totalPages` corretos com 25 registros e `limit=10`

### Movimentações

- entrada atualiza saldo **e** cria movimento na mesma transação
- `stockBefore`/`stockAfter` gravados batem com o saldo real antes/depois
- saída sem saldo → 409 e **nenhuma** linha criada em `stock_movements`
- rollback: falha ao inserir o movimento não deixa o saldo alterado
- histórico ordenado por `createdAt DESC`
- não existe rota `PATCH` nem `DELETE` para movimentação (404/405)

### Concorrência — o teste central

```ts
it('não permite saída concorrente acima do saldo', async () => {
  const product = await createProduct({ currentStock: '10.000' });

  const results = await Promise.all(
    Array.from({ length: 5 }, () =>
      request(app)
        .post('/api/v1/stock-movements/out')
        .set('Authorization', bearer)
        .send({ productId: product.id, quantity: '3.000', reason: 'CONSUMPTION' }),
    ),
  );

  expect(results.filter((r) => r.status === 201)).toHaveLength(3);
  expect(results.filter((r) => r.status === 409)).toHaveLength(2);

  const after = await findProduct(product.id);
  expect(after.currentStock.toString()).toBe('1.000');

  const movements = await countMovements(product.id);
  expect(movements).toBe(3);
});
```

Este teste falha de forma determinística se a implementação ler o saldo antes de decidir.
É a prova executável da §4.5 — e é a razão de a suíte de integração usar Postgres real.

Variante complementar: entradas e saídas concorrentes misturadas, verificando no fim que
`currentStock == soma(IN) - soma(OUT)`.

### Inventário

- aprovação cria um ajuste por item divergente e nenhum para item sem divergência
- aprovação é atômica: erro em um item não aplica nenhum ajuste
- aprovação concorrente dupla → um 200 e um 409
- `expectedQty` fica congelado: movimentação após a contagem não altera a divergência
- `(inventoryId, productId)` duplicado → 409

### Auditoria

- login bem-sucedido grava `LOGIN_SUCCESS`
- login falho grava tentativa com `userId` nulo e e-mail preservado
- atualização de produto grava `before` e `after`
- criação de usuário grava o registro **sem** `passwordHash` em `after` (assertiva direta
  sobre o JSON gravado)
- alteração de papel é registrada
- não existe rota de escrita ou exclusão em `/audit`

### Reconciliação

Após uma sequência gerada de ~200 movimentações aleatórias, para todo produto:
`soma(IN) − soma(OUT) ± ajustes == currentStock`. Prova que a denormalização da §4.4 se
mantém consistente.

## 7.5 Testes E2E (Playwright)

Dois fluxos, contra a aplicação real com banco semeado.

**Fluxo 1 — ciclo de estoque**

```
login (OPERATOR) → dashboard carrega indicadores reais
→ cria produto (saldo 0)
→ entrada de 50 → saldo exibido = 50
→ saída de 20 → saldo exibido = 30
→ histórico mostra 2 movimentações na ordem correta com autor
→ tenta saída de 100 → mensagem de estoque insuficiente, saldo permanece 30
```

**Fluxo 2 — inventário**

```
login (MANAGER) → abre inventário com 3 produtos
→ informa contagens (uma acima, uma abaixo, uma igual)
→ tela exibe as divergências calculadas
→ aprova
→ saldos dos produtos refletem os ajustes
→ histórico de cada produto mostra o ajuste vinculado ao inventário
→ inventário aparece como APPROVED com responsável
```

O passo final do Fluxo 1 (saída negada) é incluído de propósito: garante que a regra de
negócio chega até a interface com mensagem útil, e não como erro 500 genérico.

## 7.6 Testes de componente (frontend)

Vitest + Testing Library, por comportamento observável:
`DataTable` (skeleton, empty, error, ordenação, paginação), `ConfirmDialog` (não executa a
ação ao cancelar), `StockBadge` (classifica os três estados), formulário de produto
(mensagem de erro do Zod junto ao campo), rota protegida (redireciona para `/login` sem
sessão), e submit desabilitado durante requisição pendente.

## 7.7 Execução

```bash
# backend
npm run test              # unitários
npm run test:int          # integração (sobe Postgres de teste)
npm run test:cov          # relatório de cobertura

# frontend
npm run test              # unitários + componente
npm run test:e2e          # Playwright
```

Banco de teste separado (`stockflow_test`), nunca o de desenvolvimento. A suíte de
integração aplica `prisma migrate deploy` antes de rodar e trunca as tabelas entre casos,
de modo que a ordem dos testes não influencie o resultado.

## 7.8 CI

GitHub Actions, em push e pull request:

```
lint → typecheck → test (unit) → test:int (com serviço Postgres) → build → test:e2e
```

Qualquer etapa vermelha reprova o pipeline. Nenhum teste é marcado como `skip` para o CI
passar; se um teste não puder rodar, isso é reportado como problema, não silenciado.

## 7.9 Compromisso de honestidade

Nenhum resultado de teste será relatado neste projeto sem execução real. Ao final de cada
fase, o relatório trará a saída do comando — incluindo falhas, se houver. Teste que não
rodou é reportado como "não executado", não como "passou".
