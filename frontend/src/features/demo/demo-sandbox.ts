import { toast } from 'sonner';
import type { Category, CategoryInput } from '@/features/categories/api';
import type {
  DashboardSummary,
  MovementsChartPoint,
  RecentMovement,
} from '@/features/dashboard/api';
import type {
  Inventory,
  InventoryAdjustment,
  InventoryApprovalResult,
  InventoryItem,
  InventoryStatusValue,
} from '@/features/inventories/api';
import type {
  Product,
  ProductInput,
  ProductMovement,
  StockStatusFilter,
} from '@/features/products/api';
import type {
  DivergenceRow,
  InventoryReportRow,
  LowStockItem,
  MovementsReportRow,
  OutOfStockItem,
  ReconciliationRow,
} from '@/features/reports/api';
import type { AdjustmentInput, MovementInput } from '@/features/stock-movements/api';
import type { Supplier, SupplierInput } from '@/features/suppliers/api';
import { ApiError, setDemoRequestInterceptor } from '@/lib/api-client';
import { compareDecimal } from '@/lib/decimal';
import type { Page } from '@/lib/pagination';
import { classifyStock } from '@/lib/stock-status';
import { createInitialDemoState, type DemoState } from './demo-seed';

export const DEMO_STORAGE_KEY = 'stockflow:demo:state:v1';
export const DEMO_SIMULATION_FEEDBACK =
  'Alteração simulada com sucesso. Os dados originais foram preservados.';

let memoryState: DemoState | null = null;
let idCounter = 100;
type DemoCacheResetListener = () => void;
let cacheResetListener: DemoCacheResetListener | null = null;

export function setDemoCacheResetListener(listener: DemoCacheResetListener | null): void {
  cacheResetListener = listener;
}

function nextDemoId(prefix: string): string {
  idCounter += 1;
  return `${prefix}-sim-${String(Date.now())}-${String(idCounter)}`;
}

/**
 * Converte string decimal (até 3 casas) para inteiro escalado por 1000 (BigInt).
 * Zero uso de ponto flutuante IEEE-754.
 */
export function toMillis(decimalStr: string): bigint {
  const trimmed = decimalStr.trim();
  const negative = trimmed.startsWith('-');
  const unsigned = trimmed.replace(/^[+-]/, '');
  const [intPart = '0', fracPart = ''] = unsigned.split('.');
  const cleanInt = intPart.replace(/\D/g, '') || '0';
  const cleanFrac = fracPart.replace(/\D/g, '').padEnd(3, '0').slice(0, 3);
  const absVal = BigInt(cleanInt) * 1000n + BigInt(cleanFrac);
  return negative && absVal !== 0n ? -absVal : absVal;
}

/**
 * Formata inteiro escalado por 1000 (BigInt) para string decimal com 3 casas (`0.000`).
 */
export function fromMillis(value: bigint): string {
  const negative = value < 0n;
  const abs = negative ? -value : value;
  const intPart = abs / 1000n;
  const fracPart = (abs % 1000n).toString().padStart(3, '0');
  return `${negative ? '-' : ''}${intPart.toString()}.${fracPart}`;
}

function normalizeDecimal3(raw: string | undefined, fallback = '0.000'): string {
  if (!raw || raw.trim().length === 0) {
    return fallback;
  }
  return fromMillis(toMillis(raw));
}

function normalizeCost4(raw: string | undefined, fallback = '0.0000'): string {
  if (!raw || raw.trim().length === 0) {
    return fallback;
  }
  const trimmed = raw.trim().replace(/^[+-]/, '');
  const [intPart = '0', fracPart = ''] = trimmed.split('.');
  const cleanInt = (intPart.replace(/\D/g, '') || '0').replace(/^0+(?=\d)/, '');
  const cleanFrac = fracPart.replace(/\D/g, '').padEnd(4, '0').slice(0, 4);
  return `${cleanInt}.${cleanFrac}`;
}

function readStorage(): DemoState | null {
  if (typeof window === 'undefined') {
    return null;
  }
  try {
    const raw = window.sessionStorage.getItem(DEMO_STORAGE_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as DemoState;
    if (
      parsed &&
      typeof parsed.visitorName === 'string' &&
      Array.isArray(parsed.products) &&
      Array.isArray(parsed.categories)
    ) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

function writeStorage(state: DemoState | null): void {
  if (typeof window === 'undefined') {
    return;
  }
  try {
    if (state === null) {
      window.sessionStorage.removeItem(DEMO_STORAGE_KEY);
    } else {
      window.sessionStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(state));
    }
  } catch {
    // Em ambientes restritos sem sessionStorage, mantém apenas em memória.
  }
}

function getState(): DemoState | null {
  const stored = readStorage();
  if (stored !== null) {
    memoryState = stored;
    setDemoRequestInterceptor(handleDemoRequest);
    return stored;
  }
  return memoryState;
}

function saveState(state: DemoState): void {
  memoryState = state;
  setDemoRequestInterceptor(handleDemoRequest);
  writeStorage(state);
}

export function validateVisitorName(rawName: string): {
  valid: boolean;
  sanitized: string;
  error?: string;
} {
  const sanitized = rawName.trim().replace(/\s+/g, ' ');
  if (sanitized.length === 0) {
    return { valid: false, sanitized: '', error: 'Informe seu nome ou apelido para continuar.' };
  }
  if (sanitized.length < 2) {
    return {
      valid: false,
      sanitized,
      error: 'O nome ou apelido deve ter pelo menos 2 caracteres.',
    };
  }
  if (sanitized.length > 50) {
    return {
      valid: false,
      sanitized,
      error: 'O nome ou apelido deve ter no máximo 50 caracteres.',
    };
  }
  return { valid: true, sanitized };
}

export function startDemoSession(visitorName: string): DemoState {
  const validation = validateVisitorName(visitorName);
  if (!validation.valid) {
    throw new Error(validation.error);
  }
  const initial = createInitialDemoState(validation.sanitized);
  saveState(initial);
  cacheResetListener?.();
  return initial;
}

export function resetDemoSession(): DemoState | null {
  const current = getState();
  if (!current) {
    return null;
  }
  const fresh = createInitialDemoState(current.visitorName);
  saveState(fresh);
  cacheResetListener?.();
  return fresh;
}

export function endDemoSession(): void {
  memoryState = null;
  setDemoRequestInterceptor(null);
  writeStorage(null);
  cacheResetListener?.();
}

export function isDemoSessionActive(): boolean {
  return getState() !== null;
}

export function getDemoVisitorName(): string | null {
  return getState()?.visitorName ?? null;
}

export function formatDemoDisplayName(visitorName: string): string {
  return `${visitorName} (Modo visitante)`;
}

function paginate<T>(items: T[], searchParams: URLSearchParams): Page<T> {
  const page = Math.max(1, Number.parseInt(searchParams.get('page') ?? '1', 10) || 1);
  const limit = Math.max(1, Number.parseInt(searchParams.get('limit') ?? '20', 10) || 20);
  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const start = (page - 1) * limit;
  const data = items.slice(start, start + limit);

  return {
    data,
    meta: {
      page,
      limit,
      total,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1,
    },
  };
}

function parseJsonBody<T>(init: RequestInit): T {
  if (typeof init.body !== 'string' || init.body.length === 0) {
    return {} as T;
  }
  return JSON.parse(init.body) as T;
}

function enrichInventory(inv: Inventory, state: DemoState): Inventory {
  const productMap = new Map(state.products.map((p) => [p.id, p]));
  const items = (inv.items ?? []).map((item): InventoryItem => {
    const prod = productMap.get(item.productId);
    const currentStock = prod?.currentStock ?? item.currentStock ?? '0.000';

    let movedSinceCount: string | null = null;
    let movementsSinceCount: number | null = null;

    if (item.countedAt !== null) {
      const countedTime = new Date(item.countedAt).getTime();
      const postMovements = state.movements.filter(
        (m) =>
          m.productId === item.productId &&
          new Date(m.createdAt).getTime() > countedTime &&
          m.inventoryItemId !== item.id,
      );
      movementsSinceCount = postMovements.length;
      let deltaMillis = 0n;
      for (const m of postMovements) {
        if (m.type === 'IN') {
          deltaMillis += toMillis(m.quantity);
        } else if (m.type === 'OUT') {
          deltaMillis -= toMillis(m.quantity);
        } else {
          deltaMillis += toMillis(m.stockAfter) - toMillis(m.stockBefore);
        }
      }
      movedSinceCount = fromMillis(deltaMillis);
    }

    return {
      ...item,
      ...(prod ? { productSku: prod.sku, productName: prod.name } : {}),
      currentStock,
      movedSinceCount,
      movementsSinceCount,
    };
  });

  return {
    ...inv,
    items,
  };
}

/**
 * Interceptador de requisições da API para o Modo Demonstração.
 *
 * Nunca realiza chamadas HTTP (`fetch`) nem acessa o banco de produção.
 * Opera 100% sobre o estado isolado do visitante.
 */
export function handleDemoRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const state = getState();
  if (!state) {
    return Promise.reject(new ApiError(401, 'UNAUTHORIZED', 'Sessão de demonstração inativa.'));
  }

  const method = (init.method ?? 'GET').toUpperCase();
  const [pathname = '/', queryString = ''] = path.split('?');
  const searchParams = new URLSearchParams(queryString);
  const nowIso = new Date().toISOString();
  const visitorActor = {
    id: 'demo-visitor',
    name: formatDemoDisplayName(state.visitorName),
  };

  const completeWrite = <R>(result: R): Promise<R> => {
    saveState(state);
    toast.success(DEMO_SIMULATION_FEEDBACK);
    return Promise.resolve(result);
  };

  // Bloqueio explícito de rotas administrativas e sensíveis (Usuários e Auditoria)
  if (pathname.startsWith('/users') || pathname.startsWith('/audit')) {
    return Promise.reject(
      new ApiError(
        403,
        'FORBIDDEN_ROLE',
        'Informações de usuários e auditoria são restritas e não estão expostas na demonstração.',
      ),
    );
  }

  // Rotas de sessão caso invocadas durante a demonstração (nunca batem na rede)
  if (pathname === '/auth/me' && method === 'GET') {
    return Promise.resolve({
      id: 'demo-visitor',
      name: formatDemoDisplayName(state.visitorName),
      email: 'visitante@demo.stockflow.local',
      role: 'MANAGER',
    } as unknown as T);
  }

  if (pathname === '/auth/logout' && method === 'POST') {
    endDemoSession();
    return Promise.resolve(undefined as unknown as T);
  }

  // ─── Dashboard ─────────────────────────────────────────────────────────────
  if (pathname === '/dashboard/summary' && method === 'GET') {
    const activeProducts = state.products.filter((p) => p.isActive);
    let lowStock = 0;
    let outOfStock = 0;
    for (const p of activeProducts) {
      const status = classifyStock(p.currentStock, p.minStock);
      if (status === 'out') outOfStock += 1;
      else if (status === 'low') lowStock += 1;
    }
    const cutoff30 = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const movementsLast30Days = state.movements.filter(
      (m) => new Date(m.createdAt).getTime() >= cutoff30,
    ).length;

    const summary: DashboardSummary = {
      activeProducts: activeProducts.length,
      lowStock,
      outOfStock,
      movementsLast30Days,
    };
    return Promise.resolve(summary as unknown as T);
  }

  if (pathname === '/dashboard/movements-chart' && method === 'GET') {
    const days = Math.max(1, Number.parseInt(searchParams.get('days') ?? '30', 10) || 30);
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    const grouped = new Map<string, MovementsChartPoint>();

    for (const m of state.movements) {
      const ts = new Date(m.createdAt).getTime();
      if (ts < cutoff) continue;
      const day = m.createdAt.slice(0, 10);
      const key = `${day}:${m.type}`;
      const existing = grouped.get(key);
      if (existing) {
        existing.total += 1;
      } else {
        grouped.set(key, { day, type: m.type, total: 1 });
      }
    }

    const points = Array.from(grouped.values()).sort((a, b) => a.day.localeCompare(b.day));
    return Promise.resolve(points as unknown as T);
  }

  if (pathname === '/dashboard/recent-movements' && method === 'GET') {
    const limit = Math.max(1, Number.parseInt(searchParams.get('limit') ?? '10', 10) || 10);
    const prodMap = new Map(state.products.map((p) => [p.id, p]));
    const sorted = [...state.movements]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit)
      .map((m): RecentMovement => {
        const prod = prodMap.get(m.productId);
        const sku = prod?.sku ?? m.product?.sku;
        return {
          id: m.id,
          productId: m.productId,
          productName: prod?.name ?? m.product?.name ?? 'Produto',
          ...(sku !== undefined ? { productSku: sku } : {}),
          type: m.type,
          reason: m.reason,
          quantity: m.quantity,
          stockAfter: m.stockAfter,
          userName: m.user.name,
          createdAt: m.createdAt,
        };
      });
    return Promise.resolve(sorted as unknown as T);
  }

  // ─── Categories ────────────────────────────────────────────────────────────
  if (pathname === '/categories' && method === 'GET') {
    let list = [...state.categories];
    const isActiveParam = searchParams.get('isActive');
    if (isActiveParam === 'true') list = list.filter((c) => c.isActive);
    if (isActiveParam === 'false') list = list.filter((c) => !c.isActive);
    const search = searchParams.get('search')?.trim().toLowerCase();
    if (search) {
      list = list.filter((c) => c.name.toLowerCase().includes(search));
    }
    const order = searchParams.get('order') === 'desc' ? -1 : 1;
    list.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR') * order);
    return Promise.resolve(paginate(list, searchParams) as unknown as T);
  }

  if (pathname === '/categories' && method === 'POST') {
    const input = parseJsonBody<CategoryInput>(init);
    const trimmedName = input.name.trim();
    const duplicate = state.categories.some(
      (c) => c.name.toLowerCase() === trimmedName.toLowerCase(),
    );
    if (duplicate) {
      return Promise.reject(
        new ApiError(409, 'CATEGORY_ALREADY_EXISTS', 'Já existe uma categoria com este nome.'),
      );
    }
    const created: Category = {
      id: nextDemoId('cat'),
      name: trimmedName,
      description: input.description?.trim() ? input.description.trim() : null,
      isActive: true,
      createdAt: nowIso,
      updatedAt: nowIso,
    };
    state.categories.push(created);
    return completeWrite(created as unknown as T);
  }

  const categoryStatusMatch = /^\/categories\/([^/]+)\/status$/.exec(pathname);
  if (categoryStatusMatch) {
    const catId = categoryStatusMatch[1]!;
    const category = state.categories.find((c) => c.id === catId);
    if (!category) {
      return Promise.reject(new ApiError(404, 'CATEGORY_NOT_FOUND', 'Categoria não encontrada.'));
    }
    if (method === 'PATCH') {
      const { isActive } = parseJsonBody<{ isActive: boolean }>(init);
      if (!isActive) {
        const hasActiveProducts = state.products.some((p) => p.categoryId === catId && p.isActive);
        if (hasActiveProducts) {
          return Promise.reject(
            new ApiError(
              409,
              'CATEGORY_HAS_PRODUCTS',
              'Não é possível inativar uma categoria que possui produtos ativos vinculados.',
            ),
          );
        }
      }
      category.isActive = isActive;
      category.updatedAt = nowIso;
      return completeWrite({ ...category } as unknown as T);
    }
  }

  const categoryDetailMatch = /^\/categories\/([^/]+)$/.exec(pathname);
  if (categoryDetailMatch) {
    const catId = categoryDetailMatch[1]!;
    const category = state.categories.find((c) => c.id === catId);
    if (!category) {
      return Promise.reject(new ApiError(404, 'CATEGORY_NOT_FOUND', 'Categoria não encontrada.'));
    }
    if (method === 'GET') {
      return Promise.resolve({ ...category } as unknown as T);
    }
    if (method === 'PATCH') {
      const input = parseJsonBody<Partial<CategoryInput>>(init);
      if (input.name !== undefined) {
        const trimmedName = input.name.trim();
        const duplicate = state.categories.some(
          (c) => c.id !== catId && c.name.toLowerCase() === trimmedName.toLowerCase(),
        );
        if (duplicate) {
          return Promise.reject(
            new ApiError(409, 'CATEGORY_ALREADY_EXISTS', 'Já existe uma categoria com este nome.'),
          );
        }
        category.name = trimmedName;
      }
      if (input.description !== undefined) {
        category.description =
          input.description.trim().length > 0 ? input.description.trim() : null;
      }
      category.updatedAt = nowIso;
      return completeWrite({ ...category } as unknown as T);
    }
  }

  // ─── Suppliers ─────────────────────────────────────────────────────────────
  if (pathname === '/suppliers' && method === 'GET') {
    let list = [...state.suppliers];
    const isActiveParam = searchParams.get('isActive');
    if (isActiveParam === 'true') list = list.filter((s) => s.isActive);
    if (isActiveParam === 'false') list = list.filter((s) => !s.isActive);
    const search = searchParams.get('search')?.trim().toLowerCase();
    if (search) {
      list = list.filter(
        (s) =>
          s.name.toLowerCase().includes(search) ||
          (s.taxId?.toLowerCase().includes(search) ?? false) ||
          (s.email?.toLowerCase().includes(search) ?? false),
      );
    }
    const order = searchParams.get('order') === 'desc' ? -1 : 1;
    list.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR') * order);
    return Promise.resolve(paginate(list, searchParams) as unknown as T);
  }

  if (pathname === '/suppliers' && method === 'POST') {
    const input = parseJsonBody<SupplierInput>(init);
    const trimmedName = input.name.trim();
    if (state.suppliers.some((s) => s.name.toLowerCase() === trimmedName.toLowerCase())) {
      return Promise.reject(
        new ApiError(409, 'SUPPLIER_ALREADY_EXISTS', 'Já existe um fornecedor com este nome.'),
      );
    }
    const taxId = input.taxId?.trim() || null;
    if (taxId && state.suppliers.some((s) => s.taxId === taxId)) {
      return Promise.reject(
        new ApiError(409, 'SUPPLIER_TAX_ID_ALREADY_EXISTS', 'Este CNPJ/CPF já está cadastrado.'),
      );
    }
    const created: Supplier = {
      id: nextDemoId('sup'),
      name: trimmedName,
      taxId,
      email: input.email?.trim() || null,
      phone: input.phone?.trim() || null,
      notes: input.notes?.trim() || null,
      isActive: true,
      createdAt: nowIso,
      updatedAt: nowIso,
    };
    state.suppliers.push(created);
    return completeWrite(created as unknown as T);
  }

  const supplierProductsMatch = /^\/suppliers\/([^/]+)\/products$/.exec(pathname);
  if (supplierProductsMatch && method === 'GET') {
    const supId = supplierProductsMatch[1]!;
    const linked = state.products
      .filter((p) => p.supplierId === supId)
      .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
    return Promise.resolve(paginate(linked, searchParams) as unknown as T);
  }

  const supplierStatusMatch = /^\/suppliers\/([^/]+)\/status$/.exec(pathname);
  if (supplierStatusMatch && method === 'PATCH') {
    const supId = supplierStatusMatch[1]!;
    const supplier = state.suppliers.find((s) => s.id === supId);
    if (!supplier) {
      return Promise.reject(new ApiError(404, 'SUPPLIER_NOT_FOUND', 'Fornecedor não encontrado.'));
    }
    const { isActive } = parseJsonBody<{ isActive: boolean }>(init);
    supplier.isActive = isActive;
    supplier.updatedAt = nowIso;
    if (!isActive) {
      for (const p of state.products) {
        if (p.supplierId === supId) {
          p.supplierId = null;
          p.updatedAt = nowIso;
        }
      }
    }
    return completeWrite({ ...supplier } as unknown as T);
  }

  const supplierDetailMatch = /^\/suppliers\/([^/]+)$/.exec(pathname);
  if (supplierDetailMatch) {
    const supId = supplierDetailMatch[1]!;
    const supplier = state.suppliers.find((s) => s.id === supId);
    if (!supplier) {
      return Promise.reject(new ApiError(404, 'SUPPLIER_NOT_FOUND', 'Fornecedor não encontrado.'));
    }
    if (method === 'GET') {
      return Promise.resolve({ ...supplier } as unknown as T);
    }
    if (method === 'PATCH') {
      const input = parseJsonBody<Partial<SupplierInput>>(init);
      if (input.name !== undefined) {
        const trimmedName = input.name.trim();
        if (
          state.suppliers.some(
            (s) => s.id !== supId && s.name.toLowerCase() === trimmedName.toLowerCase(),
          )
        ) {
          return Promise.reject(
            new ApiError(409, 'SUPPLIER_ALREADY_EXISTS', 'Já existe um fornecedor com este nome.'),
          );
        }
        supplier.name = trimmedName;
      }
      if (input.taxId !== undefined) {
        supplier.taxId = input.taxId.trim() || null;
      }
      if (input.email !== undefined) {
        supplier.email = input.email.trim() || null;
      }
      if (input.phone !== undefined) {
        supplier.phone = input.phone.trim() || null;
      }
      if (input.notes !== undefined) {
        supplier.notes = input.notes.trim() || null;
      }
      supplier.updatedAt = nowIso;
      return completeWrite({ ...supplier } as unknown as T);
    }
  }

  // ─── Products ──────────────────────────────────────────────────────────────
  if (pathname === '/products' && method === 'GET') {
    let list = [...state.products];
    const isActiveParam = searchParams.get('isActive');
    if (isActiveParam === 'true') list = list.filter((p) => p.isActive);
    if (isActiveParam === 'false') list = list.filter((p) => !p.isActive);

    const categoryId = searchParams.get('categoryId');
    if (categoryId) list = list.filter((p) => p.categoryId === categoryId);

    const supplierId = searchParams.get('supplierId');
    if (supplierId) list = list.filter((p) => p.supplierId === supplierId);

    const stockStatus = searchParams.get('stockStatus') as StockStatusFilter | null;
    if (stockStatus === 'out' || stockStatus === 'low' || stockStatus === 'ok') {
      list = list.filter((p) => classifyStock(p.currentStock, p.minStock) === stockStatus);
    }

    const search = searchParams.get('search')?.trim().toLowerCase();
    if (search) {
      list = list.filter(
        (p) => p.name.toLowerCase().includes(search) || p.sku.toLowerCase().includes(search),
      );
    }

    const sort = searchParams.get('sort') ?? 'name';
    const order = searchParams.get('order') === 'desc' ? -1 : 1;
    list.sort((a, b) => {
      if (sort === 'sku') return a.sku.localeCompare(b.sku, 'pt-BR') * order;
      if (sort === 'currentStock') return compareDecimal(a.currentStock, b.currentStock) * order;
      if (sort === 'createdAt') return a.createdAt.localeCompare(b.createdAt) * order;
      return a.name.localeCompare(b.name, 'pt-BR') * order;
    });

    return Promise.resolve(paginate(list, searchParams) as unknown as T);
  }

  if (pathname === '/products' && method === 'POST') {
    const input = parseJsonBody<ProductInput>(init);
    const sku = input.sku.trim().toUpperCase();
    if (state.products.some((p) => p.sku.toUpperCase() === sku)) {
      return Promise.reject(
        new ApiError(409, 'SKU_ALREADY_EXISTS', 'Já existe um produto cadastrado com este SKU.'),
      );
    }
    const created: Product = {
      id: nextDemoId('prd'),
      sku,
      name: input.name.trim(),
      description: input.description?.trim() ? input.description.trim() : null,
      categoryId: input.categoryId,
      supplierId: input.supplierId?.trim() ? input.supplierId.trim() : null,
      unit: input.unit,
      currentStock: '0.000',
      minStock: normalizeDecimal3(input.minStock, '0.000'),
      unitCost: normalizeCost4(input.unitCost, '0.0000'),
      isActive: true,
      createdAt: nowIso,
      updatedAt: nowIso,
    };
    state.products.push(created);
    return completeWrite(created as unknown as T);
  }

  const productMovementsMatch = /^\/products\/([^/]+)\/movements$/.exec(pathname);
  if (productMovementsMatch && method === 'GET') {
    const prodId = productMovementsMatch[1]!;
    const product = state.products.find((p) => p.id === prodId);
    if (!product) {
      return Promise.reject(new ApiError(404, 'PRODUCT_NOT_FOUND', 'Produto não encontrado.'));
    }
    const list = state.movements
      .filter((m) => m.productId === prodId)
      .map((m) => ({
        ...m,
        product: { id: product.id, name: product.name, sku: product.sku },
      }))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return Promise.resolve(paginate(list, searchParams) as unknown as T);
  }

  const productStatusMatch = /^\/products\/([^/]+)\/status$/.exec(pathname);
  if (productStatusMatch && method === 'PATCH') {
    const prodId = productStatusMatch[1]!;
    const product = state.products.find((p) => p.id === prodId);
    if (!product) {
      return Promise.reject(new ApiError(404, 'PRODUCT_NOT_FOUND', 'Produto não encontrado.'));
    }
    const { isActive } = parseJsonBody<{ isActive: boolean }>(init);
    product.isActive = isActive;
    product.updatedAt = nowIso;
    return completeWrite({ ...product } as unknown as T);
  }

  const productDetailMatch = /^\/products\/([^/]+)$/.exec(pathname);
  if (productDetailMatch) {
    const prodId = productDetailMatch[1]!;
    const prodIndex = state.products.findIndex((p) => p.id === prodId);
    const product = state.products[prodIndex];
    if (!product) {
      return Promise.reject(new ApiError(404, 'PRODUCT_NOT_FOUND', 'Produto não encontrado.'));
    }
    if (method === 'GET') {
      return Promise.resolve({ ...product } as unknown as T);
    }
    if (method === 'PATCH') {
      const input = parseJsonBody<Partial<ProductInput>>(init);
      if (input.name !== undefined) product.name = input.name.trim();
      if (input.description !== undefined) {
        product.description = input.description.trim() || null;
      }
      if (input.categoryId !== undefined) product.categoryId = input.categoryId;
      if (input.supplierId !== undefined) {
        product.supplierId = input.supplierId.trim() || null;
      }
      if (input.unit !== undefined) product.unit = input.unit;
      if (input.minStock !== undefined) {
        product.minStock = normalizeDecimal3(input.minStock, product.minStock);
      }
      if (input.unitCost !== undefined) {
        product.unitCost = normalizeCost4(input.unitCost, product.unitCost);
      }
      product.updatedAt = nowIso;
      return completeWrite({ ...product } as unknown as T);
    }
    if (method === 'DELETE') {
      state.products.splice(prodIndex, 1);
      state.movements = state.movements.filter((m) => m.productId !== prodId);
      for (const inv of state.inventories) {
        if (inv.items) {
          inv.items = inv.items.filter((item) => item.productId !== prodId);
        }
      }
      return completeWrite(undefined as unknown as T);
    }
  }

  // ─── Stock Movements ───────────────────────────────────────────────────────
  if (pathname === '/stock-movements' && method === 'GET') {
    const prodMap = new Map(state.products.map((p) => [p.id, p]));
    let list = state.movements.map((m) => {
      const prod = prodMap.get(m.productId);
      return {
        ...m,
        ...(prod ? { product: { id: prod.id, name: prod.name, sku: prod.sku } } : {}),
      };
    });

    const productId = searchParams.get('productId');
    if (productId) list = list.filter((m) => m.productId === productId);

    const type = searchParams.get('type');
    if (type) list = list.filter((m) => m.type === type);

    const reason = searchParams.get('reason');
    if (reason) list = list.filter((m) => m.reason === reason);

    const dateFrom = searchParams.get('dateFrom');
    if (dateFrom) list = list.filter((m) => m.createdAt.slice(0, 10) >= dateFrom);

    const dateTo = searchParams.get('dateTo');
    if (dateTo) list = list.filter((m) => m.createdAt.slice(0, 10) <= dateTo);

    const order = searchParams.get('order') === 'asc' ? 1 : -1;
    list.sort((a, b) => a.createdAt.localeCompare(b.createdAt) * order);

    return Promise.resolve(paginate(list, searchParams) as unknown as T);
  }

  if (
    (pathname === '/stock-movements/in' || pathname === '/stock-movements/out') &&
    method === 'POST'
  ) {
    const input = parseJsonBody<MovementInput>(init);
    const product = state.products.find((p) => p.id === input.productId);
    if (!product) {
      return Promise.reject(new ApiError(404, 'PRODUCT_NOT_FOUND', 'Produto não encontrado.'));
    }
    if (!product.isActive) {
      return Promise.reject(
        new ApiError(409, 'PRODUCT_INACTIVE', 'Não é possível movimentar um produto inativo.'),
      );
    }

    const qtyMillis = toMillis(input.quantity);
    if (qtyMillis <= 0n) {
      return Promise.reject(
        new ApiError(400, 'VALIDATION_ERROR', 'A quantidade deve ser maior que zero.'),
      );
    }

    const beforeMillis = toMillis(product.currentStock);
    const isOut = pathname.endsWith('/out');

    if (isOut && beforeMillis < qtyMillis) {
      return Promise.reject(
        new ApiError(409, 'INSUFFICIENT_STOCK', 'Saldo insuficiente para realizar a saída.', {
          available: product.currentStock,
          requested: fromMillis(qtyMillis),
        }),
      );
    }

    const afterMillis = isOut ? beforeMillis - qtyMillis : beforeMillis + qtyMillis;
    const stockBefore = product.currentStock;
    const stockAfter = fromMillis(afterMillis);

    product.currentStock = stockAfter;
    product.updatedAt = nowIso;

    const movement: ProductMovement = {
      id: nextDemoId('mov'),
      productId: product.id,
      product: { id: product.id, name: product.name, sku: product.sku },
      type: isOut ? 'OUT' : 'IN',
      reason: input.reason,
      quantity: fromMillis(qtyMillis),
      stockBefore,
      stockAfter,
      note: input.note?.trim() || null,
      referenceDoc: input.referenceDoc?.trim() || null,
      inventoryItemId: null,
      user: visitorActor,
      createdAt: nowIso,
    };

    state.movements.unshift(movement);
    return completeWrite(movement as unknown as T);
  }

  if (pathname === '/stock-movements/adjustment' && method === 'POST') {
    const input = parseJsonBody<AdjustmentInput>(init);
    const product = state.products.find((p) => p.id === input.productId);
    if (!product) {
      return Promise.reject(new ApiError(404, 'PRODUCT_NOT_FOUND', 'Produto não encontrado.'));
    }
    if (!product.isActive) {
      return Promise.reject(
        new ApiError(409, 'PRODUCT_INACTIVE', 'Não é possível ajustar um produto inativo.'),
      );
    }

    const beforeMillis = toMillis(product.currentStock);
    const afterMillis = toMillis(input.finalQuantity);
    if (beforeMillis === afterMillis) {
      return Promise.reject(
        new ApiError(
          422,
          'BUSINESS_RULE_VIOLATION',
          'O ajuste não altera o saldo atual do produto.',
        ),
      );
    }

    const diffMillis =
      afterMillis > beforeMillis ? afterMillis - beforeMillis : beforeMillis - afterMillis;
    const stockBefore = product.currentStock;
    const stockAfter = fromMillis(afterMillis);

    product.currentStock = stockAfter;
    product.updatedAt = nowIso;

    const movement: ProductMovement = {
      id: nextDemoId('mov'),
      productId: product.id,
      product: { id: product.id, name: product.name, sku: product.sku },
      type: 'ADJUSTMENT',
      reason: input.reason,
      quantity: fromMillis(diffMillis),
      stockBefore,
      stockAfter,
      note: input.note.trim(),
      referenceDoc: input.referenceDoc?.trim() || null,
      inventoryItemId: null,
      user: visitorActor,
      createdAt: nowIso,
    };

    state.movements.unshift(movement);
    return completeWrite(movement as unknown as T);
  }

  // ─── Inventories ───────────────────────────────────────────────────────────
  if (pathname === '/inventories' && method === 'GET') {
    let list = state.inventories.map((inv) => {
      const { items: _items, ...summary } = inv;
      return summary;
    });
    const status = searchParams.get('status') as InventoryStatusValue | null;
    if (status) {
      list = list.filter((inv) => inv.status === status);
    }
    const order = searchParams.get('order') === 'asc' ? 1 : -1;
    list.sort((a, b) => a.startedAt.localeCompare(b.startedAt) * order);
    return Promise.resolve(paginate(list, searchParams) as unknown as T);
  }

  if (pathname === '/inventories' && method === 'POST') {
    const input = parseJsonBody<{ productIds: string[]; note?: string }>(init);
    const seq = String(state.nextInventorySeq).padStart(4, '0');
    state.nextInventorySeq += 1;

    const items: InventoryItem[] = input.productIds.map((pid) => {
      const prod = state.products.find((p) => p.id === pid);
      if (!prod) {
        throw new ApiError(404, 'PRODUCT_NOT_FOUND', 'Produto não encontrado.');
      }
      return {
        id: nextDemoId('inv-item'),
        productId: prod.id,
        productSku: prod.sku,
        productName: prod.name,
        expectedQty: prod.currentStock,
        countedQty: null,
        divergence: null,
        countedAt: null,
        countedBy: null,
        currentStock: prod.currentStock,
        movedSinceCount: null,
        movementsSinceCount: null,
      };
    });

    const created: Inventory = {
      id: nextDemoId('inv'),
      code: `INV-2026-${seq}`,
      status: 'OPEN',
      note: input.note?.trim() || null,
      startedAt: nowIso,
      closedAt: null,
      createdBy: visitorActor,
      approvedBy: null,
      approvedAt: null,
      items,
    };

    state.inventories.unshift(created);
    return completeWrite(enrichInventory(created, state) as unknown as T);
  }

  const countItemMatch = /^\/inventories\/([^/]+)\/items\/([^/]+)\/count$/.exec(pathname);
  if (countItemMatch && method === 'PATCH') {
    const [, invId = '', itemId = ''] = countItemMatch;
    const inv = state.inventories.find((i) => i.id === invId);
    if (!inv) {
      return Promise.reject(new ApiError(404, 'INVENTORY_NOT_FOUND', 'Inventário não encontrado.'));
    }
    if (inv.status !== 'OPEN' && inv.status !== 'COUNTING') {
      return Promise.reject(
        new ApiError(409, 'INVENTORY_NOT_OPEN', 'Este inventário não aceita novas contagens.'),
      );
    }
    const item = inv.items?.find((it) => it.id === itemId);
    if (!item) {
      return Promise.reject(new ApiError(404, 'INVENTORY_ITEM_NOT_FOUND', 'Item não encontrado.'));
    }

    const { countedQty } = parseJsonBody<{ countedQty: string }>(init);
    const countedNormalized = normalizeDecimal3(countedQty);
    const expectedMillis = toMillis(item.expectedQty ?? '0.000');
    const countedMillis = toMillis(countedNormalized);

    item.countedQty = countedNormalized;
    item.divergence = fromMillis(countedMillis - expectedMillis);
    item.countedAt = nowIso;
    item.countedBy = visitorActor;
    item.movedSinceCount = '0.000';
    item.movementsSinceCount = 0;

    if (inv.status === 'OPEN') {
      inv.status = 'COUNTING';
    }

    return completeWrite({ ...item } as unknown as T);
  }

  const inventoryActionMatch = /^\/inventories\/([^/]+)\/(submit|approve|cancel)$/.exec(pathname);
  if (inventoryActionMatch && method === 'POST') {
    const [, invId = '', action = ''] = inventoryActionMatch;
    const inv = state.inventories.find((i) => i.id === invId);
    if (!inv) {
      return Promise.reject(new ApiError(404, 'INVENTORY_NOT_FOUND', 'Inventário não encontrado.'));
    }

    if (action === 'submit') {
      const items = inv.items ?? [];
      const uncounted = items.some((it) => it.countedQty === null);
      if (uncounted) {
        return Promise.reject(
          new ApiError(
            422,
            'INVENTORY_INCOMPLETE',
            'Todos os itens precisam ser contados antes de enviar para aprovação.',
          ),
        );
      }
      inv.status = 'PENDING_APPROVAL';
      return completeWrite(enrichInventory(inv, state) as unknown as T);
    }

    if (action === 'cancel') {
      inv.status = 'CANCELLED';
      inv.closedAt = nowIso;
      return completeWrite(enrichInventory(inv, state) as unknown as T);
    }

    if (action === 'approve') {
      if (inv.status !== 'PENDING_APPROVAL') {
        return Promise.reject(
          new ApiError(
            409,
            'INVENTORY_INVALID_STATE',
            'O inventário precisa estar aguardando aprovação.',
          ),
        );
      }

      const adjustments: InventoryAdjustment[] = [];
      for (const item of inv.items ?? []) {
        const divMillis = toMillis(item.divergence ?? '0.000');
        if (divMillis === 0n) continue;

        const prod = state.products.find((p) => p.id === item.productId);
        if (!prod) continue;

        const beforeMillis = toMillis(prod.currentStock);
        const afterMillis = beforeMillis + divMillis;
        if (afterMillis < 0n) {
          return Promise.reject(
            new ApiError(
              409,
              'INSUFFICIENT_STOCK',
              `Aprovação deixaria o produto ${prod.name} com saldo negativo.`,
            ),
          );
        }

        const stockBefore = prod.currentStock;
        const stockAfter = fromMillis(afterMillis);
        prod.currentStock = stockAfter;
        prod.updatedAt = nowIso;

        const absDelta = divMillis < 0n ? -divMillis : divMillis;
        const movementId = nextDemoId('mov');
        const movement: ProductMovement = {
          id: movementId,
          productId: prod.id,
          product: { id: prod.id, name: prod.name, sku: prod.sku },
          type: 'ADJUSTMENT',
          reason: 'INVENTORY_ADJUSTMENT',
          quantity: fromMillis(absDelta),
          stockBefore,
          stockAfter,
          note: `Ajuste automático na aprovação do inventário ${inv.code}`,
          referenceDoc: inv.code,
          inventoryItemId: item.id,
          user: visitorActor,
          createdAt: nowIso,
        };
        state.movements.unshift(movement);

        adjustments.push({
          inventoryItemId: item.id,
          productId: prod.id,
          appliedDelta: fromMillis(divMillis),
          movedSinceCount: item.movedSinceCount ?? '0.000',
          stockBefore,
          stockAfter,
          movementId,
        });
      }

      inv.status = 'APPROVED';
      inv.approvedBy = visitorActor;
      inv.approvedAt = nowIso;
      inv.closedAt = nowIso;

      const result: InventoryApprovalResult = {
        inventory: enrichInventory(inv, state),
        adjustments,
        adjustedItemsCount: adjustments.length,
      };
      return completeWrite(result as unknown as T);
    }
  }

  const inventoryDetailMatch = /^\/inventories\/([^/]+)$/.exec(pathname);
  if (inventoryDetailMatch && method === 'GET') {
    const invId = inventoryDetailMatch[1]!;
    const inv = state.inventories.find((i) => i.id === invId);
    if (!inv) {
      return Promise.reject(new ApiError(404, 'INVENTORY_NOT_FOUND', 'Inventário não encontrado.'));
    }
    return Promise.resolve(enrichInventory(inv, state) as unknown as T);
  }

  // ─── Reports ───────────────────────────────────────────────────────────────
  if (pathname === '/reports/low-stock' && method === 'GET') {
    const rows: LowStockItem[] = state.products
      .filter((p) => p.isActive && classifyStock(p.currentStock, p.minStock) === 'low')
      .map((p) => ({
        id: p.id,
        sku: p.sku,
        name: p.name,
        currentStock: p.currentStock,
        minStock: p.minStock,
        deficit: fromMillis(toMillis(p.minStock) - toMillis(p.currentStock)),
      }));
    return Promise.resolve(rows as unknown as T);
  }

  if (pathname === '/reports/out-of-stock' && method === 'GET') {
    const rows: OutOfStockItem[] = state.products
      .filter((p) => p.isActive && classifyStock(p.currentStock, p.minStock) === 'out')
      .map((p) => ({
        id: p.id,
        sku: p.sku,
        name: p.name,
      }));
    return Promise.resolve(rows as unknown as T);
  }

  if (pathname === '/reports/movements' && method === 'GET') {
    const dateFrom = searchParams.get('dateFrom');
    const dateTo = searchParams.get('dateTo');
    const grouped = new Map<
      string,
      { type: string; reason: string; count: number; total: bigint }
    >();

    for (const m of state.movements) {
      const day = m.createdAt.slice(0, 10);
      if (dateFrom && day < dateFrom) continue;
      if (dateTo && day > dateTo) continue;
      const key = `${m.type}:${m.reason}`;
      const existing = grouped.get(key);
      if (existing) {
        existing.count += 1;
        existing.total += toMillis(m.quantity);
      } else {
        grouped.set(key, {
          type: m.type,
          reason: m.reason,
          count: 1,
          total: toMillis(m.quantity),
        });
      }
    }

    const rows: MovementsReportRow[] = Array.from(grouped.values()).map((g) => ({
      type: g.type,
      reason: g.reason,
      movementsCount: g.count,
      totalQuantity: fromMillis(g.total),
    }));
    return Promise.resolve(rows as unknown as T);
  }

  if (pathname === '/reports/inventories' && method === 'GET') {
    const rows: InventoryReportRow[] = state.inventories.map((inv) => {
      const items = inv.items ?? [];
      return {
        id: inv.id,
        code: inv.code,
        status: inv.status,
        startedAt: inv.startedAt,
        closedAt: inv.closedAt,
        itemsCount: items.length,
        countedCount: items.filter((it) => it.countedQty !== null).length,
        adjustedCount: items.filter(
          (it) => it.divergence !== null && toMillis(it.divergence) !== 0n,
        ).length,
      };
    });
    return Promise.resolve(rows as unknown as T);
  }

  if (pathname === '/reports/divergences' && method === 'GET') {
    const rows: DivergenceRow[] = [];
    for (const inv of state.inventories) {
      const enriched = enrichInventory(inv, state);
      for (const item of enriched.items ?? []) {
        if (
          item.countedQty !== null &&
          item.divergence !== null &&
          toMillis(item.divergence) !== 0n
        ) {
          rows.push({
            inventoryId: inv.id,
            inventoryCode: inv.code,
            itemId: item.id,
            productId: item.productId,
            productName: item.productName ?? 'Produto',
            expectedQty: item.expectedQty ?? '0.000',
            countedQty: item.countedQty,
            movedSinceCount: item.movedSinceCount ?? '0.000',
          });
        }
      }
    }
    return Promise.resolve(rows as unknown as T);
  }

  if (pathname === '/reports/stock-reconciliation' && method === 'GET') {
    const rows: ReconciliationRow[] = state.products.map((p) => ({
      id: p.id,
      sku: p.sku,
      name: p.name,
      currentStock: p.currentStock,
      derivedStock: p.currentStock,
      difference: '0.000',
    }));
    return Promise.resolve(rows as unknown as T);
  }

  return Promise.reject(
    new ApiError(404, 'NOT_FOUND', `Rota de demonstração não encontrada: ${method} ${pathname}`),
  );
}
