import { expect, test } from '@playwright/test';
import {
  apiCreateCategory,
  apiCreateEntry,
  apiCreateProduct,
  apiLogin,
  uiLogin,
  uniqueSuffix,
} from './helpers/api';

/**
 * Fluxo 2 — inventário (docs/07-testes.md §7.5, docs/19-plano-fase-7.md §19.5.2).
 *
 * Login único como MANAGER, exatamente como o roadmap descreve: abrir,
 * aprovar e cancelar inventário são ações de ADMIN/MANAGER, e a contagem em
 * si não tem restrição de papel — então, ao contrário do Fluxo 1, não há
 * divergência de RBAC a resolver aqui.
 *
 * Saldo inicial de cada produto vem de uma entrada real lançada pela API
 * (fixture), nunca escrito direto no banco — preserva a regra do plano de
 * que o frontend/teste nunca altera saldo fora dos serviços transacionais do
 * backend.
 */
test('inventário: abertura, contagem com divergências, aprovação e ajuste real de saldo', async ({
  page,
  request,
}) => {
  const suffix = uniqueSuffix();
  const manager = await apiLogin(request, 'gerente@stockflow.local');
  const category = await apiCreateCategory(request, manager, `Categoria Inv E2E ${suffix}`);

  const produtoAcima = await apiCreateProduct(request, manager, {
    sku: `INV-A-${suffix}`,
    name: `Produto Acima ${suffix}`,
    categoryId: category.id,
  });
  const produtoAbaixo = await apiCreateProduct(request, manager, {
    sku: `INV-B-${suffix}`,
    name: `Produto Abaixo ${suffix}`,
    categoryId: category.id,
  });
  const produtoIgual = await apiCreateProduct(request, manager, {
    sku: `INV-C-${suffix}`,
    name: `Produto Igual ${suffix}`,
    categoryId: category.id,
  });

  // Saldo inicial de 100 nos três, via entrada real.
  await apiCreateEntry(request, manager, produtoAcima.id, '100.000');
  await apiCreateEntry(request, manager, produtoAbaixo.id, '100.000');
  await apiCreateEntry(request, manager, produtoIgual.id, '100.000');

  // ── login (MANAGER) ────────────────────────────────────────────────────
  await uiLogin(page, 'gerente@stockflow.local');

  // ── abre inventário com 3 produtos ────────────────────────────────────
  await page.goto('/inventories/new');
  await page.getByPlaceholder('Buscar por SKU ou nome para adicionar…').fill(suffix);

  // Escopado a <main>: a barra lateral de navegação também é feita de
  // <ul>/<li>, então `page.locator('ul').first()` sem esse escopo pegava a
  // lista de navegação, não a de resultados da busca — o primeiro <ul> da
  // página inteira, não da área de conteúdo. Dentro de <main>, a lista de
  // RESULTADOS é sempre o primeiro <ul>: a de "já selecionados" só existe a
  // partir do primeiro item adicionado e vem depois dela no código-fonte.
  const resultados = page.locator('main').locator('ul').first();

  for (const produto of [produtoAcima, produtoAbaixo, produtoIgual]) {
    const linha = resultados.locator('li').filter({ hasText: produto.sku });
    await linha.getByRole('button', { name: 'Adicionar' }).click();
  }

  await page.getByRole('button', { name: 'Abrir inventário' }).click();
  await expect(page).toHaveURL(/\/inventories\/[0-9a-f-]+$/);
  await expect(page.getByText('Aberto', { exact: true })).toBeVisible();

  // ── informa contagens (uma acima, uma abaixo, uma igual) ──────────────
  async function contar(sku: string, valor: string): Promise<void> {
    const linha = page.getByRole('row', { name: new RegExp(sku) });
    await linha.getByPlaceholder('0.000').fill(valor);
    await linha.getByRole('button', { name: 'Salvar' }).click();
    await expect(linha.getByRole('button', { name: 'Salvar' })).toBeEnabled();
  }

  await contar(produtoAcima.sku, '110.000');
  await contar(produtoAbaixo.sku, '90.000');
  await contar(produtoIgual.sku, '100.000');

  // ── tela exibe as divergências calculadas ─────────────────────────────
  await expect(page.getByRole('row', { name: new RegExp(produtoAcima.sku) })).toContainText(
    '10,000',
  );
  await expect(page.getByRole('row', { name: new RegExp(produtoAbaixo.sku) })).toContainText(
    '-10,000',
  );
  await expect(page.getByRole('row', { name: new RegExp(produtoIgual.sku) })).toContainText(
    '0,000',
  );

  // ── aprova ──────────────────────────────────────────────────────────
  await page.getByRole('button', { name: 'Enviar para aprovação' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Confirmar' }).click();
  await expect(page.getByText('Aguardando aprovação', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Aprovar' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Confirmar' }).click();
  await expect(page.getByText('Aprovado', { exact: true })).toBeVisible();

  // ── saldos dos produtos refletem os ajustes ──────────────────────────
  await page.goto(`/products/${produtoAcima.id}`);
  await expect(page.getByText('110,000').first()).toBeVisible();

  await page.goto(`/products/${produtoAbaixo.id}`);
  await expect(page.getByText('90,000').first()).toBeVisible();

  await page.goto(`/products/${produtoIgual.id}`);
  // Sem divergência: o saldo não muda, continua o da entrada original.
  await expect(page.getByText('100,000').first()).toBeVisible();

  // ── histórico mostra o ajuste vinculado ao inventário ─────────────────
  await page.goto(`/products/${produtoAcima.id}`);
  await page.getByRole('tab', { name: 'Histórico' }).click();
  await expect(page.getByRole('row', { name: /Ajuste de inventário/ })).toBeVisible();
});
