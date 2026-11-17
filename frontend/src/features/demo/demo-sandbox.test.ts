import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createCategory,
  listCategories,
  setCategoryStatus,
  updateCategory,
} from '@/features/categories/api';
import {
  getDashboardSummary,
  getMovementsChart,
  getRecentMovements,
} from '@/features/dashboard/api';
import {
  DEMO_SIMULATION_FEEDBACK,
  endDemoSession,
  formatDemoDisplayName,
  getDemoVisitorName,
  isDemoSessionActive,
  resetDemoSession,
  startDemoSession,
  validateVisitorName,
} from '@/features/demo/demo-sandbox';
import {
  approveInventory,
  cancelInventory,
  countItem,
  getInventory,
  listInventories,
  openInventory,
  submitInventory,
} from '@/features/inventories/api';
import {
  createProduct,
  deleteProduct,
  getProduct,
  listProductMovements,
  listProducts,
  setProductStatus,
  updateProduct,
} from '@/features/products/api';
import {
  getDivergencesReport,
  getInventoriesReport,
  getLowStockReport,
  getMovementsReport,
  getOutOfStockReport,
  getStockReconciliationReport,
} from '@/features/reports/api';
import {
  createAdjustment,
  createInMovement,
  createOutMovement,
  listMovements,
} from '@/features/stock-movements/api';
import {
  createSupplier,
  listSupplierProducts,
  listSuppliers,
  setSupplierStatus,
  updateSupplier,
} from '@/features/suppliers/api';
import { listUsers } from '@/features/users/api';
import { listAudit } from '@/features/audit/api';
import { ApiError } from '@/lib/api-client';
import { toast } from 'sonner';

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

describe('Demo Sandbox (Fase 9)', () => {
  beforeEach(() => {
    endDemoSession();
    sessionStorage.clear();
    vi.stubGlobal('fetch', vi.fn());
    vi.clearAllMocks();
  });

  afterEach(() => {
    endDemoSession();
    sessionStorage.clear();
    vi.unstubAllGlobals();
  });

  describe('validação do nome do visitante e ciclo de vida da sessão', () => {
    it('rejeita nome vazio, só espaços, muito curto (< 2) ou muito longo (> 50)', () => {
      expect(validateVisitorName('').valid).toBe(false);
      expect(validateVisitorName('   ').valid).toBe(false);
      expect(validateVisitorName('A').valid).toBe(false);
      expect(validateVisitorName('A'.repeat(51)).valid).toBe(false);
    });

    it('aceita e normaliza nome válido e formata identificação com (Modo visitante)', () => {
      const result = validateVisitorName('  Ana   Beatriz  ');
      expect(result).toEqual({ valid: true, sanitized: 'Ana Beatriz' });
      expect(formatDemoDisplayName(result.sanitized)).toBe('Ana Beatriz (Modo visitante)');
    });

    it('inicia, persiste no sessionStorage e encerra a sessão sem chamar fetch', async () => {
      expect(isDemoSessionActive()).toBe(false);

      startDemoSession('Ana');
      expect(isDemoSessionActive()).toBe(true);
      expect(getDemoVisitorName()).toBe('Ana');

      const summary = await getDashboardSummary();
      expect(summary.activeProducts).toBe(10);
      expect(fetch).not.toHaveBeenCalled();

      endDemoSession();
      expect(isDemoSessionActive()).toBe(false);
      expect(getDemoVisitorName()).toBeNull();
    });
  });

  describe('produtos (listagem, criação, edição, inativação e exclusão)', () => {
    beforeEach(() => {
      startDemoSession('Carlos');
    });

    it('cria, edita, inativa e exclui um produto no estado isolado emitindo feedback de simulação', async () => {
      const created = await createProduct({
        sku: 'fer-9900',
        name: 'Chave Inglesa Ajustável 10"',
        categoryId: 'cat-demo-01',
        supplierId: 'sup-demo-02',
        unit: 'UN',
        minStock: '5.000',
        unitCost: '58.9000',
      });

      expect(created.sku).toBe('FER-9900');
      expect(created.currentStock).toBe('0.000');
      expect(toast.success).toHaveBeenCalledWith(DEMO_SIMULATION_FEEDBACK);

      const updated = await updateProduct(created.id, {
        name: 'Chave Inglesa Ajustável 12" Profissional',
        minStock: '8.000',
      });
      expect(updated.name).toBe('Chave Inglesa Ajustável 12" Profissional');
      expect(updated.minStock).toBe('8.000');

      const inactivated = await setProductStatus(created.id, false);
      expect(inactivated.isActive).toBe(false);

      await deleteProduct(created.id);
      await expect(getProduct(created.id)).rejects.toMatchObject({
        status: 404,
        code: 'PRODUCT_NOT_FOUND',
      });
      expect(fetch).not.toHaveBeenCalled();
    });

    it('recusa cadastro de SKU duplicado com 409 SKU_ALREADY_EXISTS', async () => {
      await expect(
        createProduct({
          sku: 'FER-0001',
          name: 'Duplicado',
          categoryId: 'cat-demo-01',
          unit: 'UN',
        }),
      ).rejects.toMatchObject({ status: 409, code: 'SKU_ALREADY_EXISTS' });
    });
  });

  describe('categorias e fornecedores', () => {
    beforeEach(() => {
      startDemoSession('Marina');
    });

    it('gerencia categorias e impede inativar categoria com produto ativo vinculado', async () => {
      await expect(setCategoryStatus('cat-demo-01', false)).rejects.toMatchObject({
        status: 409,
        code: 'CATEGORY_HAS_PRODUCTS',
      });

      const nova = await createCategory({
        name: 'Soldagem',
        description: 'Eletrodos, arames MIG e consumíveis.',
      });
      expect(nova.name).toBe('Soldagem');

      const editada = await updateCategory(nova.id, { name: 'Soldagem Industrial' });
      expect(editada.name).toBe('Soldagem Industrial');

      const inativada = await setCategoryStatus(nova.id, false);
      expect(inativada.isActive).toBe(false);

      const todas = await listCategories({ page: 1 });
      expect(todas.data.some((c) => c.id === nova.id)).toBe(true);
    });

    it('gerencia fornecedores e lista produtos vinculados', async () => {
      const novo = await createSupplier({
        name: 'Aços do Vale S.A.',
        taxId: '99.888.777/0001-66',
        email: 'contato@acosdovale.invalid',
      });
      expect(novo.name).toBe('Aços do Vale S.A.');

      const atualizado = await updateSupplier(novo.id, { phone: '(12) 3900-1122' });
      expect(atualizado.phone).toBe('(12) 3900-1122');

      const inativo = await setSupplierStatus(novo.id, false);
      expect(inativo.isActive).toBe(false);

      const fornecedores = await listSuppliers({ page: 1 });
      expect(fornecedores.data.some((s) => s.id === novo.id)).toBe(true);

      const vinculados = await listSupplierProducts('sup-demo-02', { page: 1 });
      expect(vinculados.data.length).toBeGreaterThan(0);
    });
  });

  describe('movimentações de estoque, dashboard e relatórios dinâmicos', () => {
    beforeEach(() => {
      startDemoSession('Rafael');
    });

    it('registra entrada, saída e ajuste atualizando saldo, histórico, dashboard e relatórios', async () => {
      const beforeSummary = await getDashboardSummary();
      expect(beforeSummary.outOfStock).toBe(2);

      // Repõe o produto ELE-0002 que estava sem estoque (0.000 -> 30.000, minStock 25.000)
      const inMov = await createInMovement({
        productId: 'prd-demo-06',
        quantity: '30.000',
        reason: 'PURCHASE',
        referenceDoc: 'NF-DEMO-01',
        note: 'Compra simulada',
      });
      expect(inMov.stockBefore).toBe('0.000');
      expect(inMov.stockAfter).toBe('30.000');
      expect(inMov.user.name).toBe('Rafael (Modo visitante)');

      // Verifica que o dashboard e o relatório de sem estoque refletiram imediatamente
      const afterSummary = await getDashboardSummary();
      expect(afterSummary.outOfStock).toBe(1);
      expect(afterSummary.movementsLast30Days).toBe(beforeSummary.movementsLast30Days + 1);

      const outOfStockReport = await getOutOfStockReport();
      expect(outOfStockReport.some((item) => item.id === 'prd-demo-06')).toBe(false);

      // Registra saída válida (30.000 -> 20.000, abaixo do mínimo de 25.000 -> entra em low-stock)
      const outMov = await createOutMovement({
        productId: 'prd-demo-06',
        quantity: '10.000',
        reason: 'CONSUMPTION',
      });
      expect(outMov.stockAfter).toBe('20.000');

      const lowStockReport = await getLowStockReport();
      const lowItem = lowStockReport.find((item) => item.id === 'prd-demo-06');
      expect(lowItem).toBeDefined();
      expect(lowItem?.deficit).toBe('5.000');

      // Tenta saída maior que o saldo disponível (20.000 < 50.000) -> 409 INSUFFICIENT_STOCK
      await expect(
        createOutMovement({
          productId: 'prd-demo-06',
          quantity: '50.000',
          reason: 'SALE',
        }),
      ).rejects.toMatchObject({
        status: 409,
        code: 'INSUFFICIENT_STOCK',
      });

      // Ajuste manual para 45.000
      const adjMov = await createAdjustment({
        productId: 'prd-demo-06',
        finalQuantity: '45.000',
        reason: 'CORRECTION',
        note: 'Conferência simulada pelo visitante',
      });
      expect(adjMov.stockBefore).toBe('20.000');
      expect(adjMov.stockAfter).toBe('45.000');
      expect(adjMov.quantity).toBe('25.000');

      const prodMovements = await listProductMovements('prd-demo-06', { page: 1 });
      expect(prodMovements.data[0]?.id).toBe(adjMov.id);

      const globalMovements = await listMovements({ page: 1 });
      expect(globalMovements.data[0]?.id).toBe(adjMov.id);

      const chart = await getMovementsChart(30);
      expect(chart.length).toBeGreaterThan(0);

      const recent = await getRecentMovements(5);
      expect(recent[0]?.id).toBe(adjMov.id);

      const movReport = await getMovementsReport({});
      expect(movReport.length).toBeGreaterThan(0);

      const reconciliation = await getStockReconciliationReport();
      expect(reconciliation.every((r) => r.difference === '0.000')).toBe(true);
    });
  });

  describe('inventários (abertura, contagem, submissão, aprovação e cancelamento)', () => {
    beforeEach(() => {
      startDemoSession('Luciana');
    });

    it('executa o fluxo completo de inventário e ajusta o saldo do produto ao aprovar', async () => {
      const opened = await openInventory({
        productIds: ['prd-demo-01'],
        note: 'Inventário de teste do visitante',
      });
      expect(opened.status).toBe('OPEN');
      const itemId = opened.items?.[0]?.id ?? '';
      expect(opened.items?.[0]?.expectedQty).toBe('40.000');

      // Não permite submeter antes de contar todos os itens
      await expect(submitInventory(opened.id)).rejects.toMatchObject({
        status: 422,
        code: 'INVENTORY_INCOMPLETE',
      });

      // Conta 37.000 (divergência de -3.000)
      const counted = await countItem(opened.id, itemId, '37.000');
      expect(counted.countedQty).toBe('37.000');
      expect(counted.divergence).toBe('-3.000');

      const submitted = await submitInventory(opened.id);
      expect(submitted.status).toBe('PENDING_APPROVAL');

      const approval = await approveInventory(opened.id);
      expect(approval.inventory.status).toBe('APPROVED');
      expect(approval.adjustedItemsCount).toBe(1);
      expect(approval.adjustments[0]?.stockAfter).toBe('37.000');

      // O saldo do produto prd-demo-01 passou de 40.000 para 37.000
      const updatedProduct = await getProduct('prd-demo-01');
      expect(updatedProduct.currentStock).toBe('37.000');

      const invReport = await getInventoriesReport();
      expect(invReport.some((r) => r.id === opened.id)).toBe(true);

      const divReport = await getDivergencesReport();
      expect(divReport.some((d) => d.inventoryId === opened.id)).toBe(true);
    });

    it('permite cancelar um inventário aberto', async () => {
      const opened = await openInventory({ productIds: ['prd-demo-02'] });
      const cancelled = await cancelInventory(opened.id);
      expect(cancelled.status).toBe('CANCELLED');

      const detail = await getInventory(opened.id);
      expect(detail.status).toBe('CANCELLED');

      const list = await listInventories({ status: 'CANCELLED' });
      expect(list.data.some((i) => i.id === opened.id)).toBe(true);
    });
  });

  describe('restauração da demonstração e bloqueio de rotas sensíveis', () => {
    it('restaura todos os dados originais ao acionar resetDemoSession', async () => {
      startDemoSession('Pedro');

      // Cria um produto e uma movimentação temporários
      await createProduct({
        name: 'Produto Adicional Temp',
        sku: 'TEMP-999',
        unit: 'UN',
        minStock: '10.000',
        unitCost: '15.0000',
        categoryId: 'cat-demo-01',
      });
      const outMov = await createOutMovement({
        productId: 'prd-demo-01',
        quantity: '5.000',
        reason: 'CONSUMPTION',
      });

      const summaryBefore = await getDashboardSummary();
      expect(summaryBefore.activeProducts).toBe(11);
      expect(summaryBefore.movementsLast30Days).toBe(16);

      const chartBefore = await getMovementsChart(30);
      const recentBefore = await getRecentMovements(10);
      expect(recentBefore[0]?.id).toBe(outMov.id);

      // Exclui um produto e altera categoria
      await deleteProduct('prd-demo-01');
      await createCategory({ name: 'Categoria Temporária' });

      const listAfterDelete = await listProducts({ page: 1 });
      expect(listAfterDelete.meta.total).toBe(10);

      // Restaura demonstração
      resetDemoSession();

      const listAfterReset = await listProducts({ page: 1 });
      expect(listAfterReset.meta.total).toBe(10);
      const restoredProd = await getProduct('prd-demo-01');
      expect(restoredProd.sku).toBe('FER-0001');

      const categoriesAfterReset = await listCategories({ page: 1 });
      expect(categoriesAfterReset.data.some((c) => c.name === 'Categoria Temporária')).toBe(false);

      // Confirma restauração completa de indicadores, movimentações recentes e gráficos
      const summaryAfter = await getDashboardSummary();
      expect(summaryAfter.activeProducts).toBe(10);
      expect(summaryAfter.movementsLast30Days).toBe(15);

      const recentAfter = await getRecentMovements(10);
      expect(recentAfter.some((m) => m.id === outMov.id)).toBe(false);

      const chartAfter = await getMovementsChart(30);
      expect(chartAfter).not.toEqual(chartBefore);
    });

    it('bloqueia acesso a /users e /audit com 403 FORBIDDEN_ROLE na demonstração', async () => {
      startDemoSession('Visitante');

      await expect(listUsers({ page: 1 })).rejects.toBeInstanceOf(ApiError);
      await expect(listUsers({ page: 1 })).rejects.toMatchObject({
        status: 403,
        code: 'FORBIDDEN_ROLE',
      });

      await expect(listAudit({ page: 1 })).rejects.toMatchObject({
        status: 403,
        code: 'FORBIDDEN_ROLE',
      });
      expect(fetch).not.toHaveBeenCalled();
    });
  });
});
