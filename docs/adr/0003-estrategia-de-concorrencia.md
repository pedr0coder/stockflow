# ADR-0003 — UPDATE condicional atômico para movimentação de estoque

**Data:** 2026-10-17 · **Status:** Aceito

## Contexto

Duas saídas simultâneas do mesmo produto não podem, juntas, consumir mais do que o saldo.
Com leitura e escrita separadas, nenhum nível de isolamento padrão impede o _lost update_,
porque a decisão de permitir a saída é tomada fora do banco:

```ts
const p = await prisma.product.findUnique({ where: { id } });  // ambos leem 10
if (p.currentStock < 8) throw ...;                             // ambos passam
await prisma.product.update({ data: { currentStock: 2 } });     // ambos gravam 2
```

Saldo 10, duas saídas de 8 aprovadas, saldo final 2. Dado corrompido.

## Decisão

A verificação e a escrita acontecem **na mesma instrução SQL**, dentro de uma transação que
também grava o movimento:

```sql
UPDATE products
   SET current_stock = current_stock - $1, updated_at = now()
 WHERE id = $2 AND is_active = true AND current_stock >= $1
RETURNING current_stock + $1 AS stock_before, current_stock AS stock_after;
```

- 1 linha retornada → saída válida, saldo já correto, `stockBefore`/`stockAfter` vindos do
  banco;
- 0 linhas → sem saldo ou produto inativo → `InsufficientStockError` → HTTP 409.

Isolamento `ReadCommitted`. O Postgres serializa as atualizações concorrentes na mesma
linha, então a segunda transação reavalia `current_stock >= $1` já com o valor atualizado.

Defesa em três camadas: validação no service, invariante no UPDATE, CHECK
`current_stock >= 0` no banco.

## Alternativas consideradas

| Alternativa                        | Por que não                                                                                                                                              |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SELECT ... FOR UPDATE` + `UPDATE` | Correto, mas dois round-trips e lock aberto no meio. O UPDATE condicional obtém o mesmo lock por menos tempo.                                            |
| Isolamento `Serializable`          | Correto, mas gera abortos por conflito que a aplicação teria de reexecutar. Custo sem benefício neste caso.                                              |
| Lock otimista com coluna `version` | Empurra o conflito para o cliente reenviar. Pior para o operador, mais código.                                                                           |
| Apenas o CHECK no banco            | Impede o estado inválido, mas o erro chegaria como violação genérica de constraint, sem distinguir "sem saldo" de bug. É a última linha, não a primeira. |

## Decisão acessória: semântica do ajuste e estoque negativo

O requisito pedia "não permitir estoque negativo **sem autorização explícita**".
A implementação **não permite saldo negativo em nenhuma hipótese**:

- `IN` e `OUT` nunca levam o saldo abaixo de zero;
- `ADJUSTMENT` recebe a **quantidade final correta** (absoluta), não um delta — a semântica
  real de recontagem ("o saldo correto é 7"), que também não produz negativo;
- a "autorização explícita" é modelada como **permissão**: só `ADMIN` e `MANAGER` criam
  ajuste, e todo ajuste é auditado com autor, motivo e saldos.

Isto é uma reinterpretação deliberada do requisito. O ganho: o CHECK `current_stock >= 0`
pode ser absoluto, e o banco passa a garantir a invariante independentemente da aplicação.
Permitir negativo sob autorização tornaria o CHECK impossível e deixaria a única garantia
no código.

## Consequências

**Positivas**

- Invariante garantida sob concorrência, com um round-trip
- Erro de negócio distinguível de bug (409 `INSUFFICIENT_STOCK`)
- Testável de forma determinística: 5 saídas paralelas sobre saldo 10 → 3 sucessos, 2 × 409

**Negativas**

- Dois pontos de `$queryRaw`, fora do query builder tipado do Prisma — exigem template
  tagged com parâmetros e revisão explícita (§8.5)
- Operação de estoque fica acoplada ao PostgreSQL (`RETURNING`). Aceito: trocar de banco
  não é requisito.

**Verificação:** §7.4 — o teste de concorrência é parte do critério de aceite da Fase 5.
