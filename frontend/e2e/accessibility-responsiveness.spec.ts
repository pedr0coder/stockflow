import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import {
  apiCreateCategory,
  apiCreateEntry,
  apiCreateProduct,
  apiLogin,
  apiOpenInventory,
  uiLogin,
  uniqueSuffix,
} from './helpers/api';

/**
 * Suíte E2E de Acessibilidade (WCAG 2.2 AA), Responsividade Multi-Viewport,
 * Navegação por Teclado e Movimento Reduzido (Marco 7C — Subetapa 7C.3,
 * docs/19-plano-fase-7.md §19.18).
 */

const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'];

async function waitForPageReady(page: Page): Promise<void> {
  await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
  await expect(page.locator('[data-slot="skeleton"]')).toHaveCount(0);
}

async function assertNoAxeViolations(page: Page, contextLabel: string): Promise<void> {
  const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
  const summary = results.violations.map((v) => ({
    id: v.id,
    impact: v.impact,
    help: v.help,
    nodes: v.nodes.map((n) => n.target),
  }));

  expect(
    results.violations,
    `Violações axe-core em ${contextLabel}: ${JSON.stringify(summary)}`,
  ).toEqual([]);
}

interface ScrollableElement {
  scrollWidth: number;
  clientWidth: number;
  scrollTop: number;
}

interface ElementWithComputedStyle {
  ownerDocument: {
    defaultView: {
      getComputedStyle: (element: unknown) => { animationDuration: string };
    } | null;
  };
}

async function assertNoHorizontalOverflow(page: Page, contextLabel: string): Promise<void> {
  const docMetrics = await page.locator('html').evaluate((el: ScrollableElement) => ({
    scrollWidth: el.scrollWidth,
    clientWidth: el.clientWidth,
  }));

  expect(
    docMetrics.scrollWidth <= docMetrics.clientWidth,
    `Overflow horizontal no documentElement em ${contextLabel}: scrollWidth=${String(docMetrics.scrollWidth)} > clientWidth=${String(docMetrics.clientWidth)}`,
  ).toBe(true);

  const mainLocator = page.locator('main#conteudo');
  if ((await mainLocator.count()) > 0) {
    const mainMetrics = await mainLocator.evaluate((el: ScrollableElement) => ({
      scrollWidth: el.scrollWidth,
      clientWidth: el.clientWidth,
    }));

    expect(
      mainMetrics.scrollWidth <= mainMetrics.clientWidth,
      `Overflow horizontal em main#conteudo em ${contextLabel}: scrollWidth=${String(mainMetrics.scrollWidth)} > clientWidth=${String(mainMetrics.clientWidth)}`,
    ).toBe(true);
  }
}

test.describe('Marco 7C — Acessibilidade WCAG 2.2 AA, Responsividade e Teclado', () => {
  test('1. auditoria AxeBuilder em páginas públicas, autenticadas e estados interativos', async ({
    page,
    request,
  }) => {
    const suffix = uniqueSuffix();
    const manager = await apiLogin(request, 'gerente@stockflow.local');
    const category = await apiCreateCategory(request, manager, `Cat A11y ${suffix}`);
    const product = await apiCreateProduct(request, manager, {
      sku: `A11Y-${suffix}`,
      name: `Produto A11y ${suffix}`,
      categoryId: category.id,
    });
    await apiCreateEntry(request, manager, product.id, '25.000');

    // ── 1.1 Página pública (/login): estado inicial e com erros de validação ──
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/login');
    await waitForPageReady(page);
    await assertNoAxeViolations(page, '/login (inicial)');

    await page.getByRole('button', { name: 'Entrar' }).click();
    await expect(page.getByRole('alert').first()).toBeVisible();
    await assertNoAxeViolations(page, '/login (com erros de validação)');

    // ── 1.2 Login real como ADMIN para acessar todas as rotas do sistema ──────
    await uiLogin(page, 'admin@stockflow.local');
    await waitForPageReady(page);

    const authenticatedRoutes = [
      '/dashboard',
      '/products',
      '/products/new',
      `/products/${product.id}`,
      '/categories',
      '/suppliers',
      '/movements',
      '/movements/new',
      '/inventories',
      '/inventories/new',
      '/reports',
      '/users',
      '/users/new',
      '/audit',
    ];

    for (const route of authenticatedRoutes) {
      await page.goto(route);
      await waitForPageReady(page);
      await assertNoAxeViolations(page, `${route} (1440x900)`);
      await assertNoHorizontalOverflow(page, `${route} (1440x900)`);
    }

    // ── 1.3 Estados interativos: erros de formulário, modal e sheet lateral ───
    await page.goto('/products/new');
    await waitForPageReady(page);
    await page.getByRole('button', { name: 'Cadastrar' }).click();
    await expect(page.getByRole('alert').first()).toBeVisible();
    await assertNoAxeViolations(page, '/products/new (com erros de validação)');

    await page.goto('/categories');
    await waitForPageReady(page);
    await page.getByRole('button', { name: 'Nova categoria' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await assertNoAxeViolations(page, '/categories (modal aberto)');
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toBeHidden();

    await page.goto('/audit');
    await waitForPageReady(page);
    await page.getByRole('button', { name: /Ver/i }).first().click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await assertNoAxeViolations(page, '/audit (sheet de detalhes aberto)');
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toBeHidden();
  });

  test('2. responsividade multi-viewport (375x812, 768x1024, 1440x900), árvore de acessibilidade e RBAC mobile', async ({
    page,
    request,
  }) => {
    const suffix = uniqueSuffix();
    const manager = await apiLogin(request, 'gerente@stockflow.local');
    const category = await apiCreateCategory(request, manager, `Cat Resp ${suffix}`);
    const product = await apiCreateProduct(request, manager, {
      sku: `RESP-${suffix}`,
      name: `Produto Resp ${suffix}`,
      categoryId: category.id,
    });
    await apiCreateEntry(request, manager, product.id, '10.000');

    await uiLogin(page, 'admin@stockflow.local');

    const cardListingRoutes = [
      '/products',
      '/categories',
      '/suppliers',
      '/movements',
      '/inventories',
      '/users',
      '/audit',
    ];

    // ── 2.1 Viewport 375x812 (Mobile): cards ativos, tabelas ocultas da árvore A11y e 0 overflow ──
    await page.setViewportSize({ width: 375, height: 812 });

    await page.goto('/dashboard');
    await waitForPageReady(page);
    await assertNoHorizontalOverflow(page, '/dashboard (375x812)');
    await assertNoAxeViolations(page, '/dashboard (375x812)');

    // Menu mobile (Sheet) em 375x812
    const mobileMenuTrigger = page.getByRole('button', { name: 'Abrir navegação' });
    await expect(mobileMenuTrigger).toBeVisible();
    await mobileMenuTrigger.click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await assertNoAxeViolations(page, '/dashboard (menu mobile aberto em 375x812)');
    await page.getByRole('button', { name: 'Fechar' }).click();
    await expect(page.getByRole('dialog')).toBeHidden();

    for (const route of cardListingRoutes) {
      await page.goto(route);
      await waitForPageReady(page);
      await assertNoHorizontalOverflow(page, `${route} (375x812)`);
      await assertNoAxeViolations(page, `${route} (375x812)`);

      // A tabela desktop tem `display: none` (`hidden sm:block`), portanto não deve
      // aparecer na árvore de acessibilidade em 375px; a lista mobile `ul.sm:hidden` deve estar visível.
      await expect(page.getByRole('table')).toHaveCount(0);
      await expect(page.locator('main ul.sm\\:hidden').first()).toBeVisible();
    }

    // Em /products (375x812), o card mobile para ADMIN exibe dados e botões Editar/Inativar
    await page.goto('/products');
    await waitForPageReady(page);
    const mobileCardList = page.locator('main ul.sm\\:hidden').first();
    await expect(mobileCardList.getByRole('link', { name: /Editar/i }).first()).toBeVisible();
    await expect(mobileCardList.getByRole('button', { name: /Inativar/i }).first()).toBeVisible();

    // Em /reports (375x812), a tabela complexa mantém scroll horizontal contido e container focável
    await page.goto('/reports');
    await waitForPageReady(page);
    await assertNoHorizontalOverflow(page, '/reports (375x812)');
    await assertNoAxeViolations(page, '/reports (375x812)');
    await expect(page.getByRole('table').first()).toBeVisible();
    await expect(page.locator('[data-slot="table-container"]').first()).toHaveAttribute(
      'tabindex',
      '0',
    );

    // ── 2.2 Viewports 768x1024 (Tablet) e 1440x900 (Desktop): tabela visível e cards ocultos ──
    for (const vp of [
      { width: 768, height: 1024, label: '768x1024' },
      { width: 1440, height: 900, label: '1440x900' },
    ]) {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      for (const route of ['/dashboard', '/products', '/movements', '/inventories', '/reports']) {
        await page.goto(route);
        await waitForPageReady(page);
        await assertNoHorizontalOverflow(page, `${route} (${vp.label})`);
        await assertNoAxeViolations(page, `${route} (${vp.label})`);
      }

      await page.goto('/products');
      await waitForPageReady(page);
      await expect(page.getByRole('table')).toHaveCount(1);
      await expect(page.locator('main ul.sm\\:hidden')).toBeHidden();
    }

    // ── 2.3 Preservação de RBAC nos cards mobile (375x812) para perfil OPERATOR ──
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/login');
    await uiLogin(page, 'operador@stockflow.local');
    await page.goto('/products');
    await waitForPageReady(page);
    const operatorCards = page.locator('main ul.sm\\:hidden').first();
    await expect(operatorCards).toBeVisible();
    await expect(operatorCards.getByRole('link', { name: /Editar/i })).toHaveCount(0);
    await expect(operatorCards.getByRole('button', { name: /Inativar/i })).toHaveCount(0);
  });

  test('3. navegação por teclado, skip link, retorno de foco, erros ARIA, contagem com Enter e movimento reduzido', async ({
    page,
    request,
  }) => {
    const suffix = uniqueSuffix();
    const manager = await apiLogin(request, 'gerente@stockflow.local');
    const category = await apiCreateCategory(request, manager, `Cat Key ${suffix}`);
    const product = await apiCreateProduct(request, manager, {
      sku: `KEY-${suffix}`,
      name: `Produto Teclado ${suffix}`,
      categoryId: category.id,
    });
    await apiCreateEntry(request, manager, product.id, '20.000');
    const inventory = await apiOpenInventory(
      request,
      manager,
      [product.id],
      `Inventário Teclado ${suffix}`,
    );

    await page.setViewportSize({ width: 1440, height: 900 });
    await uiLogin(page, 'gerente@stockflow.local');
    await waitForPageReady(page);

    // ── 3.1 Skip link ("Pular para o conteúdo") via Tab + Enter ─────────────
    await page.locator('body').focus();
    await page.keyboard.press('Tab');
    const skipLink = page.getByRole('link', { name: 'Pular para o conteúdo' });
    await expect(skipLink).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.locator('main#conteudo')).toBeFocused();

    // ── 3.2 Abertura de modal por teclado, Escape e retorno de foco ao gatilho ──
    await page.goto('/categories');
    await waitForPageReady(page);
    const newCategoryButton = page.getByRole('button', { name: 'Nova categoria' });
    await newCategoryButton.focus();
    await expect(newCategoryButton).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toBeHidden();
    await expect(newCategoryButton).toBeFocused();

    // ── 3.3 Validação de formulário por teclado e atributos ARIA (aria-invalid / aria-describedby) ──
    await page.goto('/products/new');
    await waitForPageReady(page);
    const skuInput = page.getByLabel(/^SKU/i);
    await skuInput.focus();
    await expect(skuInput).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.getByLabel(/^Nome/i)).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(skuInput).toBeFocused();

    const submitProductBtn = page.getByRole('button', { name: 'Cadastrar' });
    await submitProductBtn.focus();
    await page.keyboard.press('Enter');

    await expect(skuInput).toHaveAttribute('aria-invalid', 'true');
    const skuDescribedBy = await skuInput.getAttribute('aria-describedby');
    expect(skuDescribedBy).toBeTruthy();

    const categoryTrigger = page.getByRole('combobox', { name: /Categoria/i });
    await expect(categoryTrigger).toHaveAttribute('aria-invalid', 'true');
    const catDescribedBy = await categoryTrigger.getAttribute('aria-describedby');
    expect(catDescribedBy).toBeTruthy();

    // ── 3.4 Contagem de inventário por teclado (Enter com erro e Enter válido) ──
    await page.goto(`/inventories/${inventory.id}`);
    await waitForPageReady(page);
    await assertNoAxeViolations(page, `/inventories/${inventory.id} (1440x900)`);

    const countInput = page.getByRole('textbox', {
      name: `Quantidade contada para ${product.name} (${product.sku})`,
    });
    await expect(countInput).toBeVisible();
    await countInput.focus();
    await countInput.fill('invalido');
    await page.keyboard.press('Enter');

    await expect(countInput).toHaveAttribute('aria-invalid', 'true');
    const countErrorId = await countInput.getAttribute('aria-describedby');
    expect(countErrorId).toBeTruthy();
    await expect(page.locator(`[id="${String(countErrorId)}"]`)).toBeVisible();

    await countInput.fill('18.000');
    await page.keyboard.press('Enter');
    await expect(countInput).toHaveAttribute('aria-invalid', 'false');
    await expect(page.getByRole('row', { name: new RegExp(product.sku) })).toContainText('-2,000');

    // ── 3.5 Suporte a prefers-reduced-motion: reduce ─────────────────────────
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const reducedDuration = await page
      .locator('body')
      .evaluate(
        (el: ElementWithComputedStyle) =>
          el.ownerDocument.defaultView?.getComputedStyle(el).animationDuration ?? '',
      );
    expect(reducedDuration).toBe('1e-05s');

    await page.goto('/products');
    await waitForPageReady(page);
    const mainScrollTop = await page
      .locator('main#conteudo')
      .evaluate((el: ScrollableElement) => el.scrollTop);
    expect(mainScrollTop).toBe(0);
  });
});
