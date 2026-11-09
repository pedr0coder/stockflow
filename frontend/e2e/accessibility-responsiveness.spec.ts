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

/**
 * Navega entre rotas autenticadas utilizando exclusivamente os links e
 * controles reais da interface (`<NavLink>` da sidebar/drawer mobile e `<Link>`
 * dos cabeçalhos/listagens do React Router), preservando o estado SPA em
 * memória sem recarregar o documento (`page.goto`) nem disparar chamadas
 * artificiais a `POST /api/v1/auth/refresh`.
 */
async function navigateViaUi(page: Page, targetPath: string): Promise<void> {
  const currentPath = new URL(page.url()).pathname;
  if (currentPath === targetPath) {
    return;
  }

  const escapedTarget = targetPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const visibleLink = page.locator(`a[href="${targetPath}"]:visible`).first();
  const mobileMenuTrigger = page.getByRole('button', { name: 'Abrir navegação' });

  if ((await mobileMenuTrigger.isVisible()) && (await visibleLink.count()) === 0) {
    await mobileMenuTrigger.click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    const drawerLink = dialog.locator(`a[href="${targetPath}"]`).first();
    await expect(drawerLink).toBeVisible();
    await drawerLink.click();
    await expect(dialog).toBeHidden();
  } else {
    await visibleLink.click();
  }

  await expect(page).toHaveURL(new RegExp(`${escapedTarget}$`));
  await waitForPageReady(page);
}

async function uiLogout(page: Page, userNamePattern: RegExp): Promise<void> {
  await page.locator('header').getByRole('button', { name: userNamePattern }).click();
  await page.getByRole('menuitem', { name: 'Sair' }).click();
  await expect(page).toHaveURL(/\/login$/);
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
    test.setTimeout(60_000);

    const suffix = uniqueSuffix();
    const manager = await apiLogin(request, 'gerente@stockflow.local');
    const category = await apiCreateCategory(request, manager, `Cat A11y ${suffix}`);
    const product = await apiCreateProduct(request, manager, {
      sku: `00A11Y-${suffix}`,
      name: `00 Produto A11y ${suffix}`,
      categoryId: category.id,
    });
    await apiCreateEntry(request, manager, product.id, '25.000');
    await apiOpenInventory(request, manager, [product.id], `Inventário A11y ${suffix}`);

    // ── 1.1 Página pública (/login): estado inicial e com erros de validação ──
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/login');
    await waitForPageReady(page);
    await assertNoAxeViolations(page, '/login (inicial)');

    const loginSubmitBtn = page.getByRole('button', { name: 'Entrar' });
    await loginSubmitBtn.click();
    await loginSubmitBtn.hover();
    await expect(page.getByRole('alert').first()).toBeVisible();
    await assertNoAxeViolations(page, '/login (com erros de validação)');

    // ── 1.2 Login real como ADMIN e navegação SPA pelos links reais da interface ──
    await uiLogin(page, 'admin@stockflow.local');
    await waitForPageReady(page);

    const auditCurrentRoute = async (routeLabel: string): Promise<void> => {
      await test.step(`Auditar ${routeLabel} (1440x900)`, async () => {
        await waitForPageReady(page);
        await assertNoAxeViolations(page, `${routeLabel} (1440x900)`);
        await assertNoHorizontalOverflow(page, `${routeLabel} (1440x900)`);
      });
    };

    // /dashboard (página inicial pós-login)
    await auditCurrentRoute('/dashboard');

    // /products -> /products/:id -> /products -> /products/new (+ erros de validação)
    await navigateViaUi(page, '/products');
    await auditCurrentRoute('/products');

    await navigateViaUi(page, `/products/${product.id}`);
    await auditCurrentRoute(`/products/${product.id}`);

    await navigateViaUi(page, '/products');
    await waitForPageReady(page);
    await navigateViaUi(page, '/products/new');
    await auditCurrentRoute('/products/new');

    await page.getByRole('button', { name: 'Cadastrar' }).click();
    await expect(page.getByRole('alert').first()).toBeVisible();
    await assertNoAxeViolations(page, '/products/new (com erros de validação)');

    // /categories (+ modal aberto)
    await navigateViaUi(page, '/categories');
    await auditCurrentRoute('/categories');
    await page.getByRole('button', { name: 'Nova categoria' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await assertNoAxeViolations(page, '/categories (modal aberto)');
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toBeHidden();

    // /suppliers
    await navigateViaUi(page, '/suppliers');
    await auditCurrentRoute('/suppliers');

    // /movements -> /movements/new
    await navigateViaUi(page, '/movements');
    await auditCurrentRoute('/movements');
    await navigateViaUi(page, '/movements/new');
    await auditCurrentRoute('/movements/new');

    // /inventories -> /inventories/new
    await navigateViaUi(page, '/inventories');
    await auditCurrentRoute('/inventories');
    await navigateViaUi(page, '/inventories/new');
    await auditCurrentRoute('/inventories/new');

    // /reports
    await navigateViaUi(page, '/reports');
    await auditCurrentRoute('/reports');

    // /users -> /users/new
    await navigateViaUi(page, '/users');
    await auditCurrentRoute('/users');
    await navigateViaUi(page, '/users/new');
    await auditCurrentRoute('/users/new');

    // /audit (+ sheet de detalhes aberto)
    await navigateViaUi(page, '/audit');
    await auditCurrentRoute('/audit');
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
    test.setTimeout(60_000);

    const suffix = uniqueSuffix();
    const manager = await apiLogin(request, 'gerente@stockflow.local');
    const category = await apiCreateCategory(request, manager, `Cat Resp ${suffix}`);
    const product = await apiCreateProduct(request, manager, {
      sku: `00RESP-${suffix}`,
      name: `00 Produto Resp ${suffix}`,
      categoryId: category.id,
    });
    await apiCreateEntry(request, manager, product.id, '10.000');
    await apiOpenInventory(request, manager, [product.id], `Inventário Resp ${suffix}`);

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
      await test.step(`Auditar ${route} (375x812)`, async () => {
        await navigateViaUi(page, route);
        await waitForPageReady(page);
        await assertNoHorizontalOverflow(page, `${route} (375x812)`);
        await assertNoAxeViolations(page, `${route} (375x812)`);

        // A tabela desktop tem `display: none` (`hidden sm:block`), portanto não deve
        // aparecer na árvore de acessibilidade em 375px; a lista mobile `ul.sm:hidden` deve estar visível.
        await expect(page.getByRole('table')).toHaveCount(0);
        const mobileCardList = page.locator('main ul.sm\\:hidden').first();
        await expect(mobileCardList).toBeVisible();

        if (route === '/products') {
          // Em /products (375x812), o card mobile para ADMIN exibe dados e botões Editar/Inativar
          await expect(mobileCardList.getByRole('link', { name: /Editar/i }).first()).toBeVisible();
          await expect(
            mobileCardList.getByRole('button', { name: /Inativar/i }).first(),
          ).toBeVisible();
        }
      });
    }

    // Em /reports (375x812), a tabela complexa mantém scroll horizontal contido e container focável
    await navigateViaUi(page, '/reports');
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
        await test.step(`Auditar ${route} (${vp.label})`, async () => {
          await navigateViaUi(page, route);
          await waitForPageReady(page);
          await assertNoHorizontalOverflow(page, `${route} (${vp.label})`);
          await assertNoAxeViolations(page, `${route} (${vp.label})`);

          if (route === '/products') {
            await expect(page.getByRole('table')).toHaveCount(1);
            await expect(page.locator('main ul.sm\\:hidden')).toBeHidden();
          }
        });
      }
    }

    // ── 2.3 Redirecionamento pós-login (location.state.from = /reports) e RBAC mobile (375x812) para OPERATOR ──
    await uiLogout(page, /Ana Administradora/i);
    await page.setViewportSize({ width: 375, height: 812 });
    await uiLogin(page, 'operador@stockflow.local', { expectedPath: /\/reports$/ });
    await expect(page.getByRole('heading', { level: 1, name: 'Relatórios' })).toBeVisible();

    await navigateViaUi(page, '/products');
    await waitForPageReady(page);
    const operatorCards = page.locator('main ul.sm\\:hidden').first();
    await expect(operatorCards).toBeVisible();
    await expect(operatorCards.getByRole('link', { name: /Editar/i })).toHaveCount(0);
    await expect(operatorCards.getByRole('button', { name: /Inativar/i })).toHaveCount(0);
    await expect(page.getByRole('link', { name: /Novo produto/i })).toHaveCount(0);
  });

  test('3. navegação por teclado, skip link, retorno de foco, erros ARIA, contagem com Enter e movimento reduzido', async ({
    page,
    request,
  }) => {
    const suffix = uniqueSuffix();
    const manager = await apiLogin(request, 'gerente@stockflow.local');
    const category = await apiCreateCategory(request, manager, `Cat Key ${suffix}`);
    const product = await apiCreateProduct(request, manager, {
      sku: `00KEY-${suffix}`,
      name: `00 Produto Teclado ${suffix}`,
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
    await navigateViaUi(page, '/categories');
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
    await navigateViaUi(page, '/products');
    await waitForPageReady(page);
    await navigateViaUi(page, '/products/new');
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
    await navigateViaUi(page, '/inventories');
    await waitForPageReady(page);
    await navigateViaUi(page, `/inventories/${inventory.id}`);
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

    await navigateViaUi(page, '/products');
    await waitForPageReady(page);
    const mainScrollTop = await page
      .locator('main#conteudo')
      .evaluate((el: ScrollableElement) => el.scrollTop);
    expect(mainScrollTop).toBe(0);
  });
});
