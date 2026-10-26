import type { PrismaService } from '../../src/prisma/prisma.service';

/**
 * Invariantes de estoque que precisam continuar verdadeiras depois de
 * QUALQUER operação, com sucesso ou com falha (docs/17-plano-fase-5.md
 * §17.7.6, CI1 a CI3). Pensado para rodar em `afterEach` de todo arquivo de
 * integração do marco 5A — não só nos testes de falha.
 */
export interface StockInvariantViolation {
  produto: string;
  motivo: string;
}

interface ChainBreakRow {
  product_id: string;
  movement_id: string;
  stock_before: string;
  previous_after: string;
}

interface FinalBalanceRow {
  id: string;
  current_stock: string;
  last_stock_after: string;
}

interface OrphanMovementRow {
  id: string;
}

interface OrphanAuditRow {
  entity_id: string;
}

/**
 * CI1, em duas partes — nenhuma das duas supõe que o produto nasceu com saldo
 * zero (o que vale em produção, mas não nos fixtures de teste, que podem
 * semear `currentStock` direto no banco para montar cenário):
 *
 *  (a) a CADEIA de movimentos de cada produto não tem quebra: o
 *      `stock_before` de um movimento é sempre o `stock_after` do movimento
 *      imediatamente anterior do mesmo produto. É o que prova que nenhuma
 *      escrita concorrente perdeu o efeito de outra (lost update) — a
 *      invariante central do ADR-0003.
 *  (b) o saldo GRAVADO no produto é o `stock_after` do último movimento dele.
 *      Um produto sem nenhum movimento não entra nesta checagem: o valor que
 *      o fixture semeou não é reivindicado por nenhum histórico, de
 *      propósito.
 *
 * CI2: nenhum `current_stock` negativo (também garantido pelo CHECK da Fase
 * 2, conferido aqui pela aplicação). CI3: todo movimento SEM
 * `inventory_item_id` tem exatamente UMA auditoria `STOCK_MOVEMENT_CREATED`,
 * e vice-versa.
 */
export async function assertStockInvariants(prisma: PrismaService): Promise<void> {
  const violacoes: StockInvariantViolation[] = [];

  const quebrasDeCadeia = await prisma.$queryRaw<ChainBreakRow[]>`
    WITH ordenados AS (
      SELECT product_id, id, stock_before, stock_after,
             LAG(stock_after) OVER (PARTITION BY product_id ORDER BY created_at, id) AS anterior
        FROM stock_movements
    )
    SELECT product_id::text, id::text AS movement_id, stock_before::text,
           anterior::text AS previous_after
      FROM ordenados
     WHERE anterior IS NOT NULL AND anterior <> stock_before
  `;
  for (const linha of quebrasDeCadeia) {
    violacoes.push({
      produto: linha.product_id,
      motivo: `CI1a: movimento ${linha.movement_id} começa em ${linha.stock_before}, mas o anterior terminou em ${linha.previous_after}`,
    });
  }

  const saldoFinal = await prisma.$queryRaw<FinalBalanceRow[]>`
    WITH ultimo AS (
      SELECT DISTINCT ON (product_id) product_id, stock_after
        FROM stock_movements
       ORDER BY product_id, created_at DESC, id DESC
    )
    SELECT p.id::text, p.current_stock::text, u.stock_after::text AS last_stock_after
      FROM products p JOIN ultimo u ON u.product_id = p.id
     WHERE p.current_stock <> u.stock_after
  `;
  for (const linha of saldoFinal) {
    violacoes.push({
      produto: linha.id,
      motivo: `CI1b: saldo gravado ${linha.current_stock} difere do último movimento (${linha.last_stock_after})`,
    });
  }

  const negativos = await prisma.$queryRaw<{ id: string; current_stock: string }[]>`
    SELECT id::text, current_stock::text FROM products WHERE current_stock < 0
  `;
  for (const linha of negativos) {
    violacoes.push({ produto: linha.id, motivo: `CI2: saldo negativo ${linha.current_stock}` });
  }

  const movimentosSemAuditoria = await prisma.$queryRaw<OrphanMovementRow[]>`
    SELECT m.id::text FROM stock_movements m
     WHERE m.inventory_item_id IS NULL
       AND NOT EXISTS (
         SELECT 1 FROM audit_logs a
          WHERE a.action = 'STOCK_MOVEMENT_CREATED' AND a.entity_id = m.id
       )
  `;
  for (const linha of movimentosSemAuditoria) {
    violacoes.push({
      produto: linha.id,
      motivo: 'CI3: movimento sem auditoria STOCK_MOVEMENT_CREATED',
    });
  }

  const auditoriasSemMovimento = await prisma.$queryRaw<OrphanAuditRow[]>`
    SELECT a.entity_id::text FROM audit_logs a
     WHERE a.action = 'STOCK_MOVEMENT_CREATED'
       AND NOT EXISTS (SELECT 1 FROM stock_movements m WHERE m.id = a.entity_id)
  `;
  for (const linha of auditoriasSemMovimento) {
    violacoes.push({
      produto: linha.entity_id,
      motivo: 'CI3: auditoria sem o movimento correspondente',
    });
  }

  if (violacoes.length > 0) {
    throw new Error(
      `Invariantes de estoque violadas:\n${violacoes.map((v) => `  ${v.produto}: ${v.motivo}`).join('\n')}`,
    );
  }
}
