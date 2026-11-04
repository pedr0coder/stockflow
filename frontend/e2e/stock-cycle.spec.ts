import { expect, test } from '@playwright/test';
import {
  apiCreateCategory,
  apiCreateProduct,
  apiLogin,
  seedPasswordFor,
  uniqueSuffix,
} from './helpers/api';

/**
 * Fluxo 1 — ciclo de estoque (docs/07-testes.md §7.5, docs/19-plano-fase-7.md §19.5.2).
 *
 * Uma divergência da descrição literal do roadmap, registrada aqui e no
 * relatório final: o roadmap descreve "login (OPERATOR) → ... → cria
 * produto". `POST /products` exige ADMIN ou MANAGER
 * (`docs/08-seguranca.md §8.3`, `rbac.int-spec.ts`) — OPERATOR não pode criar
 * produto. A criação do produto (e da categoria) é feita aqui por uma sessão
 * MANAGER via API, como fixture de cenário — o mesmo papel que
 * `backend/test/helpers/app.ts` já atribui à criação de fixture em todo o
 * resto da suíte. O restante do fluxo (dashboard, entrada, saída, histórico,
 * saída negada) é conduzido pela interface como OPERATOR, exatamente como o
 * roadmap descreve.
 */
test('ciclo de estoque: entrada, saída, histórico e saída negada por saldo insuficiente', async ({
  page,
  request,
}) => {
  const suffix = uniqueSuffix();
  const manager = await apiLogin(request, 'gerente@stockflow.local');
  const category = await apiCreateCategory(request, manager, `Categoria E2E ${suffix}`);
  const product = await apiCreateProduct(request, manager, {
    sku: `E2E-${suffix}`,
    name: `Produto E2E ${suffix}`,
    categoryId: category.id,
  });

  expect(product.currentStock).toBe('0.000');

  // ── login (OPERATOR) ──────────────────────────────────────────────────
  await page.goto('/login');
  await page.getByLabel('E-mail').fill('operador@stockflow.local');
  await page.getByLabel(/^Senha/).fill(seedPasswordFor('operador@stockflow.local'));
  await page.getByRole('button', { name: 'Entrar' }).click();

  // ── dashboard carrega indicadores reais ──────────────────────────────
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
  await expect(page.getByText('Produtos ativos')).toBeVisible();

  // ── produto criado com saldo 0 ────────────────────────────────────────
  await page.goto(`/products/${product.id}`);
  await expect(page.getByText('Saldo atual')).toBeVisible();
  await expect(page.getByText('0,000').first()).toBeVisible();

  // ── entrada de 50 → saldo exibido = 50 ────────────────────────────────
  await page.goto('/movements/new');
  await page.getByPlaceholder('Buscar por SKU ou nome…').fill(suffix);
  await page.getByRole('option', { name: new RegExp(product.sku) }).click();
  await page.getByLabel('Quantidade').fill('50');
  await page.getByRole('combobox', { name: 'Motivo' }).click();
  await page.getByRole('option', { name: 'Compra' }).click();
  await page.getByRole('button', { name: 'Registrar entrada' }).click();

  await expect(page).toHaveURL(new RegExp(`/products/${product.id}$`));
  await expect(page.getByText('50,000').first()).toBeVisible();

  // ── saída de 20 → saldo exibido = 30 ──────────────────────────────────
  await page.goto('/movements/new');
  await page.getByRole('tab', { name: 'Saída' }).click();
  await page.getByPlaceholder('Buscar por SKU ou nome…').fill(suffix);
  await page.getByRole('option', { name: new RegExp(product.sku) }).click();
  await page.getByLabel('Quantidade').fill('20');
  await page.getByRole('combobox', { name: 'Motivo' }).click();
  await page.getByRole('option', { name: 'Venda' }).click();
  await page.getByRole('button', { name: 'Registrar saída' }).click();

  await expect(page).toHaveURL(new RegExp(`/products/${product.id}$`));
  await expect(page.getByText('30,000').first()).toBeVisible();

  // ── histórico mostra 2 movimentações na ordem correta, com autor ─────
  await page.getByRole('tab', { name: 'Histórico' }).click();
  const linhas = page.getByRole('row');
  await expect(linhas).toHaveCount(3); // cabeçalho + 2 movimentações
  // A mais recente (saída) aparece primeiro.
  await expect(linhas.nth(1)).toContainText('Saída');
  await expect(linhas.nth(1)).toContainText('Carla Operadora');
  await expect(linhas.nth(2)).toContainText('Entrada');
  await expect(linhas.nth(2)).toContainText('Carla Operadora');

  // ── tenta saída de 100 → estoque insuficiente, saldo permanece 30 ─────
  await page.goto('/movements/new');
  await page.getByRole('tab', { name: 'Saída' }).click();
  await page.getByPlaceholder('Buscar por SKU ou nome…').fill(suffix);
  await page.getByRole('option', { name: new RegExp(product.sku) }).click();
  await page.getByLabel('Quantidade').fill('100');
  await page.getByRole('combobox', { name: 'Motivo' }).click();
  await page.getByRole('option', { name: 'Venda' }).click();
  await page.getByRole('button', { name: 'Registrar saída' }).click();

  await expect(page.getByRole('alert')).toBeVisible();
  // A mensagem chega até a interface (não é um 500 genérico).
  await expect(page.getByRole('alert')).not.toContainText('Erro interno');
  // Permanece na própria tela de movimentação — não navegou.
  await expect(page).toHaveURL(/\/movements\/new$/);

  await page.goto(`/products/${product.id}`);
  await expect(page.getByText('30,000').first()).toBeVisible();
});
