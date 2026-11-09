import {
  expect,
  type APIRequestContext,
  type ConsoleMessage,
  type Page,
  type Request,
  type Response,
} from '@playwright/test';

/**
 * Fixtures criadas pela API real, nunca por `INSERT` direto no banco.
 *
 * Mesma decisão de `backend/test/helpers/app.ts` ("criar pela API exigiria
 * uma sessão com papel suficiente só para montar o cenário, e um 403 no
 * preparo apareceria como falha do caso que estava sendo testado"), adaptada
 * para HTTP real em vez de chamada direta ao service: aqui a "fixture direto
 * no banco" seria could ser um import do Prisma do backend dentro do pacote do
 * frontend, o que criaria uma dependência cruzada só para teste. Passar pela
 * API com uma sessão MANAGER (que tem permissão de cadastro) é tão rápido e
 * não exige essa dependência.
 */

export interface ApiSession {
  accessToken: string;
}

const SEED_PASSWORDS: Record<string, string | undefined> = {
  'admin@stockflow.local': process.env['SEED_ADMIN_PASSWORD'],
  'gerente@stockflow.local': process.env['SEED_MANAGER_PASSWORD'],
  'operador@stockflow.local': process.env['SEED_OPERATOR_PASSWORD'],
};

export function seedPasswordFor(email: string): string {
  const password = SEED_PASSWORDS[email];

  if (!password) {
    throw new Error(`Senha do seed ausente para ${email}. Verifique o .env da raiz.`);
  }

  return password;
}

/**
 * Remove credenciais em URLs, tokens JWT e senhas conhecidas do seed antes de
 * registrar qualquer mensagem de diagnóstico em falha de E2E.
 */
export function redactDiagnosticText(text: string): string {
  let sanitized = text
    .replace(/(:\/\/[^:@/\s]+:)[^@/\s]+(@)/g, '$1***$2')
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer [REDACTED]')
    .replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '[JWT_REDACTED]')
    .replace(/(password|senha|token|cookie|secret)\s*[:=]\s*[^\s,;)"']+/gi, '$1=[REDACTED]');

  for (const pwd of Object.values(SEED_PASSWORDS)) {
    if (pwd && pwd.length > 0) {
      sanitized = sanitized.split(pwd).join('[SEED_PASSWORD_REDACTED]');
    }
  }

  return sanitized;
}

function isDiagnosticRequestUrl(url: string): boolean {
  return (
    !url.includes('/node_modules/') &&
    !url.includes('/@vite') &&
    !url.includes('/@react-refresh') &&
    !url.includes('/src/') &&
    !/\.(?:ts|tsx|js|css|svg|png|ico|woff2?)(?:\?|$)/i.test(url)
  );
}

/**
 * Login pela interface real (`/login` → `/dashboard`) com coleta de evidências
 * de diagnóstico em caso de falha (URL final, alerta visível, status de
 * requisições relevantes e erros de console/página, sempre com redação de
 * dados sensíveis).
 */
export async function uiLogin(page: Page, email: string): Promise<void> {
  const consoleErrors: string[] = [];
  const relevantRequests: string[] = [];

  const onConsole = (msg: ConsoleMessage): void => {
    if (msg.type() === 'error') {
      consoleErrors.push(redactDiagnosticText(msg.text()));
    }
  };
  const onPageError = (err: Error): void => {
    consoleErrors.push(redactDiagnosticText(err.message));
  };
  const onResponse = (res: Response): void => {
    const url = res.url();
    if (isDiagnosticRequestUrl(url) || res.status() >= 400) {
      relevantRequests.push(
        `${res.request().method()} ${redactDiagnosticText(url)} -> ${String(res.status())}`,
      );
    }
  };
  const onRequestFailed = (req: Request): void => {
    const url = req.url();
    if (isDiagnosticRequestUrl(url)) {
      const reason = req.failure()?.errorText ?? 'network_error';
      relevantRequests.push(
        `${req.method()} ${redactDiagnosticText(url)} -> FALHA (${redactDiagnosticText(reason)})`,
      );
    }
  };

  page.on('console', onConsole);
  page.on('pageerror', onPageError);
  page.on('response', onResponse);
  page.on('requestfailed', onRequestFailed);

  const passwordInput = page.getByLabel(/^Senha/);

  try {
    await page.goto('/login');
    await page.getByLabel('E-mail').fill(email);
    await passwordInput.fill(seedPasswordFor(email));
    await page.getByRole('button', { name: 'Entrar' }).click();
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
  } catch (error) {
    const currentUrl = redactDiagnosticText(page.url());
    const rawAlert = await page
      .getByRole('alert')
      .first()
      .textContent({ timeout: 500 })
      .catch(() => null);
    const visibleAlert = rawAlert ? redactDiagnosticText(rawAlert.trim()) : 'nenhum';

    // Limpa o campo de senha antes de propagar a falha para que o snapshot
    // automático do Playwright (`error-context.md`) nunca grave a senha em texto puro.
    await passwordInput.fill('', { timeout: 500 }).catch(() => undefined);

    const originalMessage =
      error instanceof Error ? redactDiagnosticText(error.message) : String(error);

    throw new Error(
      `Falha no login E2E para ${email}.\n` +
        `  URL atual: ${currentUrl}\n` +
        `  Alerta visível na página: ${visibleAlert}\n` +
        `  Requisições relevantes: ${relevantRequests.length > 0 ? relevantRequests.join(' | ') : 'nenhuma'}\n` +
        `  Erros de console/página: ${consoleErrors.length > 0 ? consoleErrors.join(' | ') : 'nenhum'}\n` +
        `  Erro original: ${originalMessage}`,
      { cause: error },
    );
  } finally {
    page.off('console', onConsole);
    page.off('pageerror', onPageError);
    page.off('response', onResponse);
    page.off('requestfailed', onRequestFailed);
  }
}

interface CachedApiSession {
  session: ApiSession;
  expiresAtMs: number;
}

/**
 * Cache em memória por worker (exclusivo de E2E) para reutilizar o `accessToken`
 * de criação de fixtures (`JWT_ACCESS_TTL=15m`) entre os testes da mesma execução,
 * evitando estourar o limite de 5 tentativas / 15 min do `LoginThrottlerGuard` em
 * `POST /api/v1/auth/login` quando múltiplos specs rodam em sequência.
 *
 * - Isolado por e-mail normalizado (`trim().toLowerCase()`).
 * - Verifica `exp` do JWT com margem de segurança de 60s para nunca reutilizar token expirado.
 * - Não afeta `uiLogin` nem testes de renovação/autenticação (e suporta `forceRefresh`).
 */
const apiSessionCache = new Map<string, CachedApiSession>();
const TOKEN_EXPIRY_SAFETY_MARGIN_MS = 60_000;
const DEFAULT_TOKEN_TTL_MS = 14 * 60 * 1000;

function extractJwtExpiresAtMs(accessToken: string): number {
  try {
    const payloadPart = accessToken.split('.')[1];
    if (!payloadPart) {
      return Date.now() + DEFAULT_TOKEN_TTL_MS;
    }
    const normalized = payloadPart.replace(/-/g, '+').replace(/_/g, '/');
    const decoded = JSON.parse(atob(normalized)) as { exp?: unknown };
    if (typeof decoded.exp === 'number' && Number.isFinite(decoded.exp)) {
      return decoded.exp * 1000;
    }
  } catch {
    // Fallback seguro caso o token não possua payload base64url padrão
  }
  return Date.now() + DEFAULT_TOKEN_TTL_MS;
}

export async function apiLogin(
  request: APIRequestContext,
  email: string,
  options?: { forceRefresh?: boolean },
): Promise<ApiSession> {
  const cacheKey = email.trim().toLowerCase();

  if (!options?.forceRefresh) {
    const cached = apiSessionCache.get(cacheKey);
    if (cached && Date.now() + TOKEN_EXPIRY_SAFETY_MARGIN_MS < cached.expiresAtMs) {
      return cached.session;
    }
    apiSessionCache.delete(cacheKey);
  }

  const response = await request.post('/api/v1/auth/login', {
    data: { email, password: seedPasswordFor(email) },
  });

  if (!response.ok()) {
    throw new Error(`login da fixture falhou para ${email}: ${String(response.status())}`);
  }

  const body = (await response.json()) as { accessToken: string };
  const session: ApiSession = { accessToken: body.accessToken };
  apiSessionCache.set(cacheKey, {
    session,
    expiresAtMs: extractJwtExpiresAtMs(body.accessToken),
  });

  return session;
}

function authHeader(session: ApiSession): Record<string, string> {
  return { Authorization: `Bearer ${session.accessToken}` };
}

export async function apiCreateCategory(
  request: APIRequestContext,
  session: ApiSession,
  name: string,
): Promise<{ id: string; name: string }> {
  const response = await request.post('/api/v1/categories', {
    headers: authHeader(session),
    data: { name },
  });

  if (!response.ok()) {
    throw new Error(`fixture: falha ao criar categoria "${name}": ${String(response.status())}`);
  }

  return (await response.json()) as { id: string; name: string };
}

export interface CreateProductInput {
  sku: string;
  name: string;
  categoryId: string;
  unit?: string;
  minStock?: string;
  unitCost?: string;
}

export async function apiCreateProduct(
  request: APIRequestContext,
  session: ApiSession,
  input: CreateProductInput,
): Promise<{ id: string; sku: string; name: string; currentStock: string }> {
  const response = await request.post('/api/v1/products', {
    headers: authHeader(session),
    data: {
      sku: input.sku,
      name: input.name,
      categoryId: input.categoryId,
      unit: input.unit ?? 'UN',
      minStock: input.minStock ?? '1.000',
      unitCost: input.unitCost ?? '1.0000',
    },
  });

  if (!response.ok()) {
    throw new Error(
      `fixture: falha ao criar produto "${input.sku}": ${String(response.status())} ` +
        JSON.stringify(await response.json().catch(() => undefined)),
    );
  }

  return (await response.json()) as {
    id: string;
    sku: string;
    name: string;
    currentStock: string;
  };
}

export async function apiCreateEntry(
  request: APIRequestContext,
  session: ApiSession,
  productId: string,
  quantity: string,
): Promise<void> {
  const response = await request.post('/api/v1/stock-movements/in', {
    headers: authHeader(session),
    data: { productId, quantity, reason: 'PURCHASE' },
  });

  if (!response.ok()) {
    throw new Error(`fixture: falha ao lançar entrada: ${String(response.status())}`);
  }
}

export async function apiOpenInventory(
  request: APIRequestContext,
  session: ApiSession,
  productIds: string[],
  note?: string,
): Promise<{ id: string; code: string }> {
  const response = await request.post('/api/v1/inventories', {
    headers: authHeader(session),
    data: { productIds, ...(note !== undefined ? { note } : {}) },
  });

  if (!response.ok()) {
    throw new Error(`fixture: falha ao abrir inventário: ${String(response.status())}`);
  }

  return (await response.json()) as { id: string; code: string };
}

/** Sufixo curto e único, para SKU/nome não colidirem entre execuções. */
export function uniqueSuffix(): string {
  return Date.now().toString(36).toUpperCase();
}
