import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC_ROOT = __dirname;

/**
 * Percorre recursivamente `dir` e devolve todos os arquivos `.ts` de produção
 * (excluindo `*.spec.ts` e `src/generated/`).
 */
function listProductionTsFiles(dir: string): string[] {
  const results: string[] = [];

  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry);
    const rel = relative(SRC_ROOT, fullPath).replace(/\\/g, '/');

    if (rel === 'generated' || rel.startsWith('generated/')) {
      continue;
    }

    const stat = statSync(fullPath);

    if (stat.isDirectory()) {
      results.push(...listProductionTsFiles(fullPath));
    } else if (entry.endsWith('.ts') && !entry.endsWith('.spec.ts')) {
      results.push(fullPath);
    }
  }

  return results.sort();
}

/** Remove comentários de bloco e de linha antes de inspecionar chamadas no código. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

/**
 * Guardas arquiteturais de integridade de estoque, inventário, auditoria e SQL
 * (docs/17-plano-fase-5.md §17.6.8 G4, §17.7.3 RG-6 e Marco 7B / M7B-3).
 */
describe('Invariantes arquiteturais do backend (RG-6, G4 e SQL seguro)', () => {
  const productionFiles = listProductionTsFiles(SRC_ROOT);

  it('RG-6: stock-movements e inventories jamais invocam audit.record() fora de transação', () => {
    const criticalFiles = productionFiles.filter((filePath) => {
      const rel = relative(SRC_ROOT, filePath).replace(/\\/g, '/');
      return rel.startsWith('stock-movements/') || rel.startsWith('inventories/');
    });

    expect(criticalFiles.length).toBeGreaterThan(0);

    const violations: string[] = [];
    let transactionalCalls = 0;

    for (const filePath of criticalFiles) {
      const code = stripComments(readFileSync(filePath, 'utf8'));
      const rel = relative(SRC_ROOT, filePath).replace(/\\/g, '/');

      if (/\.record\s*\(/.test(code)) {
        violations.push(rel);
      }

      const matches = code.match(/\.recordInTransaction\s*\(/g);
      transactionalCalls += matches?.length ?? 0;
    }

    expect(violations).toEqual([]);
    expect(transactionalCalls).toBeGreaterThanOrEqual(7);
  });

  it('G4: apenas inventories.service.ts invoca applyInventoryDelta (definido em inventories.sql.ts)', () => {
    const filesReferencingDelta: string[] = [];

    for (const filePath of productionFiles) {
      const code = stripComments(readFileSync(filePath, 'utf8'));
      const rel = relative(SRC_ROOT, filePath).replace(/\\/g, '/');

      if (/\bapplyInventoryDelta\b/.test(code)) {
        filesReferencingDelta.push(rel);
      }
    }

    expect(filesReferencingDelta).toEqual([
      'inventories/inventories.service.ts',
      'inventories/inventories.sql.ts',
    ]);
  });

  it('SQL seguro: nenhum arquivo de produção usa $queryRawUnsafe, $executeRawUnsafe ou chamada não-tagged', () => {
    const unsafeFiles: string[] = [];

    for (const filePath of productionFiles) {
      const code = stripComments(readFileSync(filePath, 'utf8'));
      const rel = relative(SRC_ROOT, filePath).replace(/\\/g, '/');

      if (
        /\$(queryRawUnsafe|executeRawUnsafe)\b/.test(code) ||
        /\$(queryRaw|executeRaw)\s*(?:<[^>]*>)?\s*\(/.test(code)
      ) {
        unsafeFiles.push(rel);
      }
    }

    expect(unsafeFiles).toEqual([]);
  });

  it('SQL parametrizado: $queryRaw e $executeRaw residem apenas nos módulos auditados (*.sql.ts e allowlist da Fase 4)', () => {
    const allowedNonSqlFiles = new Set([
      'prisma/prisma.service.ts',
      'auth/token.service.ts',
      'categories/categories.service.ts',
      'products/products.service.ts',
    ]);
    const unexpectedRawSqlFiles: string[] = [];

    for (const filePath of productionFiles) {
      const code = stripComments(readFileSync(filePath, 'utf8'));
      const rel = relative(SRC_ROOT, filePath).replace(/\\/g, '/');

      if (/\$(queryRaw|executeRaw)\b/.test(code)) {
        const isAllowed = rel.endsWith('.sql.ts') || allowedNonSqlFiles.has(rel);
        if (!isAllowed) {
          unexpectedRawSqlFiles.push(rel);
        }
      }
    }

    expect(unexpectedRawSqlFiles).toEqual([]);
  });
});
