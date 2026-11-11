import { resolve } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { apiLogin, apiOpenInventory, uiLogin } from './helpers/api';

/**
 * Teste E2E de integridade e renderização das páginas críticas do portfólio.
 *
 * Garante que:
 * 1. O login legítimo funciona sem erros.
 * 2. As páginas Dashboard, Produtos, Movimentações, Inventários e Relatórios
 *    carregam todos os dados reais da API sem qualquer erro de execução,
 *    sem exceções não tratadas no React e sem estados de erro.
 * 3. Captura screenshots limpos e reais para documentação do portfólio.
 */

const SCREENSHOT_DIR = resolve(import.meta.dirname, '../../docs/screenshots');

async function waitForPageLoaded(page: Page): Promise<void> {
  await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
  await expect(page.locator('[data-slot="skeleton"]')).toHaveCount(0, { timeout: 15_000 });
  await page.waitForLoadState('networkidle');
  // Garante que nenhuma mensagem de falha ou erro de JavaScript apareça
  await expect(page.getByText('Não foi possível carregar')).toHaveCount(0);
  await expect(page.getByText('Cannot read properties')).toHaveCount(0);
}

test('páginas críticas do portfólio renderizam sem erros e atualizam capturas', async ({
  page,
  request,
}) => {
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];

  page.on('pageerror', (err) => {
    pageErrors.push(err.message);
  });

  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      const text = msg.text();
      // Ignora 401 esperado do handshake inicial de sessão no mount e favicon
      if (!text.includes('favicon.ico') && !text.includes('401 (Unauthorized)')) {
        consoleErrors.push(text);
      }
    }
  });

  // Resolução de desktop profissional (1440x900)
  await page.setViewportSize({ width: 1440, height: 900 });

  // 1. Login legítimo com usuário Administrador do seed
  await uiLogin(page, 'admin@stockflow.local');
  await waitForPageLoaded(page);

  // Garante a existência de ao menos um inventário no banco E2E para a listagem
  const adminSession = await apiLogin(request, 'admin@stockflow.local');
  const productsRes = await request.get('/api/v1/products?limit=5', {
    headers: { Authorization: `Bearer ${adminSession.accessToken}` },
  });
  if (productsRes.ok()) {
    const productsJson = (await productsRes.json()) as { data: Array<{ id: string }> };
    if (productsJson.data.length > 0) {
      try {
        await apiOpenInventory(
          request,
          adminSession,
          [productsJson.data[0]!.id],
          'Inventário de demonstração para portfólio',
        );
      } catch {
        // Se já houver inventário aberto, prossegue
      }
    }
  }

  // ── 01. Dashboard ──────────────────────────────────────────────────────────
  await page.goto('/dashboard');
  await waitForPageLoaded(page);
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
  await expect(page.getByText('Produtos ativos')).toBeVisible();
  // Aguarda estabilização visual da renderização de animação do gráfico
  await page.waitForTimeout(600);
  await page.screenshot({
    path: resolve(SCREENSHOT_DIR, '01-dashboard.png'),
    fullPage: false,
  });

  // ── 02. Produtos ───────────────────────────────────────────────────────────
  await page.goto('/products');
  await waitForPageLoaded(page);
  await expect(page.getByRole('heading', { name: 'Produtos' })).toBeVisible();
  const productsTable = page.getByRole('table', { name: 'Lista de produtos' });
  await expect(productsTable).toBeVisible();
  await expect(productsTable.locator('tbody tr')).not.toHaveCount(0);
  await page.waitForTimeout(300);
  await page.screenshot({
    path: resolve(SCREENSHOT_DIR, '02-produtos.png'),
    fullPage: false,
  });

  // ── 03. Movimentações ──────────────────────────────────────────────────────
  await page.goto('/movements');
  await waitForPageLoaded(page);
  await expect(page.getByRole('heading', { name: 'Movimentações' })).toBeVisible();
  const movementsTable = page.getByRole('table', { name: 'Histórico de movimentações' });
  await expect(movementsTable).toBeVisible();
  await expect(movementsTable.locator('tbody tr')).not.toHaveCount(0);
  // Confirma que não há mensagem de undefined (reading 'name')
  await expect(page.locator('body')).not.toContainText("reading 'name'");
  await page.waitForTimeout(300);
  await page.screenshot({
    path: resolve(SCREENSHOT_DIR, '03-movimentacoes.png'),
    fullPage: false,
  });

  // ── 04. Inventários ────────────────────────────────────────────────────────
  await page.goto('/inventories');
  await waitForPageLoaded(page);
  await expect(page.getByRole('heading', { name: 'Inventários' })).toBeVisible();
  const inventoriesTable = page.getByRole('table', { name: 'Lista de inventários' });
  await expect(inventoriesTable).toBeVisible();
  await expect(inventoriesTable.locator('tbody tr')).not.toHaveCount(0);
  await expect(page.locator('body')).not.toContainText("reading 'name'");
  await page.waitForTimeout(300);
  await page.screenshot({
    path: resolve(SCREENSHOT_DIR, '04-inventarios.png'),
    fullPage: false,
  });

  // ── 05. Relatórios ─────────────────────────────────────────────────────────
  await page.goto('/reports');
  await waitForPageLoaded(page);
  await expect(page.getByRole('heading', { name: 'Relatórios' })).toBeVisible();
  // Aguarda a tabela de relatório carregar (padrão: Estoque baixo)
  await expect(page.locator('table')).toBeVisible();
  await expect(page.getByText('Não foi possível carregar')).toHaveCount(0);
  await page.waitForTimeout(300);
  await page.screenshot({
    path: resolve(SCREENSHOT_DIR, '05-relatorios.png'),
    fullPage: false,
  });

  // Validação final de integridade da sessão inteira: nenhum erro em console ou exceção
  expect(pageErrors, `Exceções não tratadas na página: ${pageErrors.join(', ')}`).toEqual([]);
  expect(consoleErrors, `Erros no console do navegador: ${consoleErrors.join(', ')}`).toEqual([]);
});
