import type { APIRequestContext } from '@playwright/test';

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

export async function apiLogin(request: APIRequestContext, email: string): Promise<ApiSession> {
  const response = await request.post('/api/v1/auth/login', {
    data: { email, password: seedPasswordFor(email) },
  });

  if (!response.ok()) {
    throw new Error(`login da fixture falhou para ${email}: ${String(response.status())}`);
  }

  const body = (await response.json()) as { accessToken: string };

  return { accessToken: body.accessToken };
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

/** Sufixo curto e único, para SKU/nome não colidirem entre execuções. */
export function uniqueSuffix(): string {
  return Date.now().toString(36).toUpperCase();
}
