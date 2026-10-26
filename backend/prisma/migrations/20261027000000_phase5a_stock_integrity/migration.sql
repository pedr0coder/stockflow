-- Fase 5A — integridade de stock_movements (plano docs/17-plano-fase-5.md §17.8.2).
--
-- Pré-condição: recusa aplicar se já existir movimento cujo saldo não bate com
-- o tipo. Hoje a tabela está vazia nos bancos do projeto, mas o script precisa
-- ser correto também para um banco populado (é o que vai ao deploy).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM stock_movements m
     WHERE NOT (
       (m.type = 'IN'  AND m.stock_after = m.stock_before + m.quantity) OR
       (m.type = 'OUT' AND m.stock_after = m.stock_before - m.quantity) OR
       (m.type = 'ADJUSTMENT' AND m.stock_after <> m.stock_before
                              AND m.quantity = abs(m.stock_after - m.stock_before))
     )
  ) THEN
    RAISE EXCEPTION 'phase5a_stock_integrity: stock_movements com saldo incoerente; corrija antes de migrar';
  END IF;
END $$;

-- O banco recusa um movimento cujo saldo não bate com o tipo, mesmo que o
-- código tenha um defeito. Nome próprio e separado do CHECK abaixo, porque um
-- motivo novo no enum exige atualizar só o segundo.
ALTER TABLE stock_movements
  ADD CONSTRAINT stock_movements_balance_coherent CHECK (
    (type = 'IN'  AND stock_after = stock_before + quantity) OR
    (type = 'OUT' AND stock_after = stock_before - quantity) OR
    (type = 'ADJUSTMENT' AND stock_after <> stock_before
                         AND quantity = abs(stock_after - stock_before))
  ),
  ADD CONSTRAINT stock_movements_type_reason_coherent CHECK (
    (type = 'IN'  AND reason IN ('PURCHASE','RETURN_IN','PRODUCTION_IN','TRANSFER_IN')) OR
    (type = 'OUT' AND reason IN ('SALE','CONSUMPTION','LOSS','EXPIRY','TRANSFER_OUT')) OR
    (type = 'ADJUSTMENT' AND reason IN ('INVENTORY_ADJUSTMENT','CORRECTION'))
  );

-- Imutabilidade garantida no banco, não só pela ausência de rota PATCH/DELETE
-- (docs/04-banco-de-dados.md §4.4). Corrigir um erro é um novo movimento de
-- ajuste, que também fica registrado.
--
-- SQLSTATE próprio ('SF001'), e não uma classe genérica: o Prisma mapeia
-- `restrict_violation` (23001) para P2003 (violação de chave estrangeira), o
-- que confundiria quem lê o erro. Com um SQLSTATE do projeto, o código real
-- chega intacto em `meta.driverAdapterError.cause.originalCode` (medido no
-- plano, I19), e o service o traduz de propósito.
CREATE FUNCTION stock_movements_forbid_change() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'stock_movements é imutável: % não é permitido', TG_OP
    USING ERRCODE = 'SF001',
          HINT = 'Corrija com um novo movimento de ajuste.';
END
$$;

CREATE TRIGGER stock_movements_immutable
  BEFORE UPDATE OR DELETE ON stock_movements
  FOR EACH ROW EXECUTE FUNCTION stock_movements_forbid_change();
