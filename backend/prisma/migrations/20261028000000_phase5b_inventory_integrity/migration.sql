-- Fase 5B — integridade de inventories/inventory_items (plano docs/17-plano-fase-5.md
-- §17.8.3, decisão D17 recomendação A-mín).
--
-- Pré-condições: aborta com mensagem legível se os dados já violam o que a migration vai
-- exigir. Hoje as tabelas estão vazias nos bancos do projeto (nenhum service de inventário
-- existia antes deste marco), mas o script precisa ser correto também para um banco
-- populado, porque é o que vai ao deploy.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM inventory_items WHERE expected_qty < 0) THEN
    RAISE EXCEPTION 'phase5b_inventory_integrity: expected_qty negativo; corrija antes de migrar';
  END IF;

  IF EXISTS (SELECT 1 FROM inventory_items WHERE counted_qty < 0) THEN
    RAISE EXCEPTION 'phase5b_inventory_integrity: counted_qty negativo; corrija antes de migrar';
  END IF;

  IF EXISTS (
    SELECT 1 FROM inventories
     WHERE (status = 'APPROVED' AND (approved_by_id IS NULL OR approved_at IS NULL OR closed_at IS NULL))
        OR (status <> 'APPROVED' AND (approved_by_id IS NOT NULL OR approved_at IS NOT NULL))
  ) THEN
    RAISE EXCEPTION 'phase5b_inventory_integrity: inventories com aprovação incoerente; corrija antes de migrar';
  END IF;

  IF EXISTS (
    SELECT 1 FROM inventories
     WHERE (status IN ('APPROVED', 'CANCELLED') AND closed_at IS NULL)
        OR (status NOT IN ('APPROVED', 'CANCELLED') AND closed_at IS NOT NULL)
  ) THEN
    RAISE EXCEPTION 'phase5b_inventory_integrity: inventories com fechamento incoerente; corrija antes de migrar';
  END IF;

  IF EXISTS (
    SELECT product_id
      FROM inventory_items ii
      JOIN inventories i ON i.id = ii.inventory_id
     WHERE i.status NOT IN ('APPROVED', 'CANCELLED')
     GROUP BY product_id
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'phase5b_inventory_integrity: produto em mais de um inventário não finalizado; corrija antes de migrar';
  END IF;
END $$;

-- `expected_qty` passa a aceitar NULL: a partir deste marco, nasce `null` na abertura do
-- inventário e só é congelado no instante da CONTAGEM (docs/17 §17.6.3), não mais na criação
-- do item. Normaliza o que já existe (defensivo; as tabelas estão vazias hoje): item sem
-- contagem não tem por que reter um `expected_qty` nem um `counted_at`.
ALTER TABLE inventory_items ALTER COLUMN expected_qty DROP NOT NULL;

UPDATE inventory_items
   SET expected_qty = NULL,
       counted_at = NULL
 WHERE counted_qty IS NULL;

-- CHECKs de coerência. Nome próprio para cada um, pelo mesmo motivo do marco 5A: um deles
-- pode precisar mudar sem afetar os outros.
ALTER TABLE inventory_items
  ADD CONSTRAINT inventory_items_expected_qty_non_negative CHECK (expected_qty IS NULL OR expected_qty >= 0),
  ADD CONSTRAINT inventory_items_counted_qty_non_negative CHECK (counted_qty IS NULL OR counted_qty >= 0),
  ADD CONSTRAINT inventory_items_counted_pairing CHECK (
    (counted_qty IS NULL AND counted_at IS NULL AND counted_by_id IS NULL AND expected_qty IS NULL) OR
    (counted_qty IS NOT NULL AND counted_at IS NOT NULL AND counted_by_id IS NOT NULL AND expected_qty IS NOT NULL)
  );

ALTER TABLE inventories
  ADD CONSTRAINT inventories_approval_coherent CHECK (
    (status = 'APPROVED' AND approved_by_id IS NOT NULL AND approved_at IS NOT NULL AND closed_at IS NOT NULL) OR
    (status <> 'APPROVED' AND approved_by_id IS NULL AND approved_at IS NULL)
  ),
  ADD CONSTRAINT inventories_closure_coherent CHECK (
    (status IN ('APPROVED', 'CANCELLED') AND closed_at IS NOT NULL) OR
    (status NOT IN ('APPROVED', 'CANCELLED') AND closed_at IS NULL)
  );

-- D17 (A-mín, recomendação do plano contra a alternativa de tabela de reserva, §17.8.6):
-- coluna `in_progress`, índice único parcial sobre a PRÓPRIA linha do item (não uma segunda
-- fonte de verdade), e dois triggers. Nasce `true`: todo item criado já está sob a garantia,
-- sem protocolo de aplicação.
ALTER TABLE inventory_items ADD COLUMN in_progress boolean NOT NULL DEFAULT true;

UPDATE inventory_items ii
   SET in_progress = (i.status NOT IN ('APPROVED', 'CANCELLED'))
  FROM inventories i
 WHERE i.id = ii.inventory_id;

-- Índice único parcial: um produto não pode ter mais de um item "em andamento" ao mesmo
-- tempo, em qualquer inventário. Cobre também o INSERT direto, sem passar pelo service
-- (provado na análise da D17 contra a reserva separada).
CREATE UNIQUE INDEX inventory_items_one_unfinalized_per_product
  ON inventory_items (product_id)
  WHERE in_progress;

-- Trigger 1: quando um inventário sai de um estado não-terminal para APPROVED ou CANCELLED,
-- libera todos os seus itens (in_progress = false), liberando os produtos para outro
-- inventário.
CREATE FUNCTION inventories_release_items() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status IN ('APPROVED', 'CANCELLED') AND OLD.status NOT IN ('APPROVED', 'CANCELLED') THEN
    UPDATE inventory_items SET in_progress = false WHERE inventory_id = NEW.id;
  END IF;

  RETURN NEW;
END
$$;

CREATE TRIGGER inventories_release_items_trigger
  AFTER UPDATE OF status ON inventories
  FOR EACH ROW EXECUTE FUNCTION inventories_release_items();

-- Trigger 2: APPROVED e CANCELLED são terminais, garantido pelo banco, não só pela ausência
-- de rota. SQLSTATE próprio (SF002), pelo mesmo motivo do SF001 na Fase 5A: o código real
-- chega intacto em meta.driverAdapterError.cause.originalCode, sem se confundir com um erro
-- genérico do Postgres.
CREATE FUNCTION inventories_forbid_reopen() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status IN ('APPROVED', 'CANCELLED') AND NEW.status <> OLD.status THEN
    RAISE EXCEPTION 'inventories: % é estado final, % não é permitido', OLD.status, NEW.status
      USING ERRCODE = 'SF002',
            HINT = 'Estados finais não voltam. Abra um novo inventário se precisar corrigir.';
  END IF;

  RETURN NEW;
END
$$;

CREATE TRIGGER inventories_forbid_reopen_trigger
  BEFORE UPDATE OF status ON inventories
  FOR EACH ROW EXECUTE FUNCTION inventories_forbid_reopen();
