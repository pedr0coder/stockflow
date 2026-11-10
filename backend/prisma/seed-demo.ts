/**
 * Seed do ambiente público de demonstração (Fase 8 — Deploy de Portfólio).
 *
 * Por que existe um arquivo separado de `prisma/seed.ts`:
 *   - `prisma/seed.ts` recusa `NODE_ENV=production` de forma incondicional para
 *     impedir que `npx prisma db seed` rode por acidente contra um banco de
 *     produção real.
 *   - No ambiente publicado de portfólio (Neon PostgreSQL + Render Free +
 *     Cloudflare Pages, docs/09-roadmap.md §Fase 8), recrutadores e avaliadores
 *     precisam encontrar dados fictícios consistentes e contas de demonstração
 *     ativas sob `NODE_ENV=production`.
 *
 * Travas de segurança obrigatórias (`assertDemoSeedConfig`):
 *   1. Exige `ALLOW_DEMO_SEED=true` explícito no ambiente; sem essa flag, aborta
 *      antes de abrir qualquer conexão.
 *   2. Recusa executar contra os bancos de integração (`stockflow_test`) ou E2E
 *      (`stockflow_e2e`).
 *   3. Lê senhas exclusivamente do ambiente (`DEMO_*_PASSWORD` ou fallback para
 *      `SEED_*_PASSWORD`), exigindo mínimo de 10 caracteres (§8.1) e recusando
 *      senhas triviais/placeholders.
 *   4. Mantém 100% de idempotência e integridade transacional: movimentações
 *      passam por `StockMovementsService` (`referenceDoc` determinístico) e um
 *      inventário aberto de demonstração passa por `InventoriesService`.
 */
import { resolve } from 'node:path';
import { hash } from '@node-rs/argon2';
import { PrismaPg } from '@prisma/adapter-pg';
import { config as loadEnv } from 'dotenv';
import type { PinoLogger } from 'nestjs-pino';
import { v7 as uuidv7 } from 'uuid';
import { AuditService } from '../src/audit/audit.service';
import { ARGON2_OPTIONS } from '../src/auth/auth.service';
import { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH } from '../src/auth/dto/login.dto';
import { PrismaClient } from '../src/generated/prisma/client';
import { UserRole } from '../src/generated/prisma/enums';
import { InventoriesService } from '../src/inventories/inventories.service';
import type { PrismaService } from '../src/prisma/prisma.service';
import { StockMovementsService } from '../src/stock-movements/stock-movements.service';
import { extractDatabaseName } from '../scripts/e2e-reset-db';
import { CATEGORIES, PRODUCTS, SUPPLIERS, planMovementsForProduct } from './seed';

loadEnv({ path: resolve(process.cwd(), '../.env'), override: false, quiet: true });

const FORBIDDEN_DEMO_DATABASES = new Set(['stockflow_test', 'stockflow_e2e']);

const WEAK_DEMO_PASSWORDS = new Set([
  '1234567890',
  '0123456789',
  'password123',
  'Password123',
  'admin12345',
  'Admin12345',
  'senha12345',
  'Senha12345',
  'stockflow123',
  'Stockflow123',
  'qwertyuiop',
  'changeme123',
  'mudar12345',
]);

const DEMO_INVENTORY_NOTE = 'Inventário trimestral de demonstração (portfólio)';

export interface DemoSeedEnv {
  ALLOW_DEMO_SEED?: string | undefined;
  DATABASE_URL?: string | undefined;
  DIRECT_URL?: string | undefined;
  DEMO_ADMIN_PASSWORD?: string | undefined;
  DEMO_MANAGER_PASSWORD?: string | undefined;
  DEMO_OPERATOR_PASSWORD?: string | undefined;
  SEED_ADMIN_PASSWORD?: string | undefined;
  SEED_MANAGER_PASSWORD?: string | undefined;
  SEED_OPERATOR_PASSWORD?: string | undefined;
}

export interface ValidatedDemoSeedConfig {
  connectionString: string;
  passwords: {
    admin: string;
    manager: string;
    operator: string;
  };
}

function redactUrl(url: string): string {
  return url.replace(/:[^:@/]+@/, ':***@');
}

export function validateDemoPassword(rawPassword: string | undefined, varLabel: string): string {
  const password = rawPassword?.trim() ?? '';

  if (!password) {
    throw new Error(
      `${varLabel} não definida. Configure senhas explícitas nas variáveis de ambiente antes de rodar seed:demo.`,
    );
  }

  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(
      `${varLabel} tem ${String(password.length)} caracteres. O mínimo exigido pela política (§8.1) é ${String(MIN_PASSWORD_LENGTH)}.`,
    );
  }

  if (password.length > MAX_PASSWORD_LENGTH) {
    throw new Error(
      `${varLabel} excede o máximo de ${String(MAX_PASSWORD_LENGTH)} caracteres (§8.1).`,
    );
  }

  if (WEAK_DEMO_PASSWORDS.has(password) || WEAK_DEMO_PASSWORDS.has(password.toLowerCase())) {
    throw new Error(
      `${varLabel} usa um valor trivial bloqueado. Escolha uma senha de demonstração não-trivial com pelo menos ${String(MIN_PASSWORD_LENGTH)} caracteres.`,
    );
  }

  return password;
}

/**
 * Valida todas as pré-condições de segurança do seed de demonstração antes de
 * instanciar qualquer cliente de banco de dados.
 */
export function assertDemoSeedConfig(env: DemoSeedEnv): ValidatedDemoSeedConfig {
  if (env.ALLOW_DEMO_SEED?.trim() !== 'true') {
    throw new Error(
      'Seed de demonstração recusado: ALLOW_DEMO_SEED deve ser explicitamente "true".\n' +
        'Esta trava impede execução acidental em ambientes que não sejam de demonstração.',
    );
  }

  const connectionString = (env.DIRECT_URL?.trim() || env.DATABASE_URL?.trim()) ?? '';
  if (!connectionString) {
    throw new Error('DATABASE_URL (ou DIRECT_URL) não definida.');
  }

  const dbName = extractDatabaseName(connectionString);
  if (FORBIDDEN_DEMO_DATABASES.has(dbName.toLowerCase()) || /e2e|test/i.test(dbName)) {
    throw new Error(
      `Seed de demonstração recusado para o banco "${dbName}" (${redactUrl(connectionString)}): ` +
        'bancos de teste/E2E têm ciclo de vida próprio.',
    );
  }

  const admin = validateDemoPassword(
    env.DEMO_ADMIN_PASSWORD ?? env.SEED_ADMIN_PASSWORD,
    'DEMO_ADMIN_PASSWORD (ou SEED_ADMIN_PASSWORD)',
  );
  const manager = validateDemoPassword(
    env.DEMO_MANAGER_PASSWORD ?? env.SEED_MANAGER_PASSWORD,
    'DEMO_MANAGER_PASSWORD (ou SEED_MANAGER_PASSWORD)',
  );
  const operator = validateDemoPassword(
    env.DEMO_OPERATOR_PASSWORD ?? env.SEED_OPERATOR_PASSWORD,
    'DEMO_OPERATOR_PASSWORD (ou SEED_OPERATOR_PASSWORD)',
  );

  return {
    connectionString,
    passwords: { admin, manager, operator },
  };
}

interface DemoUserSpec {
  name: string;
  email: string;
  role: UserRole;
  passwordKey: keyof ValidatedDemoSeedConfig['passwords'];
}

const DEMO_USERS: readonly DemoUserSpec[] = [
  {
    name: 'Ana Administradora',
    email: 'admin@stockflow.local',
    role: UserRole.ADMIN,
    passwordKey: 'admin',
  },
  {
    name: 'Bruno Gerente',
    email: 'gerente@stockflow.local',
    role: UserRole.MANAGER,
    passwordKey: 'manager',
  },
  {
    name: 'Carla Operadora',
    email: 'operador@stockflow.local',
    role: UserRole.OPERATOR,
    passwordKey: 'operator',
  },
];

async function main(): Promise<void> {
  const config = assertDemoSeedConfig({
    ALLOW_DEMO_SEED: process.env['ALLOW_DEMO_SEED'],
    DATABASE_URL: process.env['DATABASE_URL'],
    DIRECT_URL: process.env['DIRECT_URL'],
    DEMO_ADMIN_PASSWORD: process.env['DEMO_ADMIN_PASSWORD'],
    DEMO_MANAGER_PASSWORD: process.env['DEMO_MANAGER_PASSWORD'],
    DEMO_OPERATOR_PASSWORD: process.env['DEMO_OPERATOR_PASSWORD'],
    SEED_ADMIN_PASSWORD: process.env['SEED_ADMIN_PASSWORD'],
    SEED_MANAGER_PASSWORD: process.env['SEED_MANAGER_PASSWORD'],
    SEED_OPERATOR_PASSWORD: process.env['SEED_OPERATOR_PASSWORD'],
  });

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: config.connectionString }),
  });

  try {
    console.log('Semeando dados fictícios do ambiente de demonstração (Fase 8)...\n');

    // ── 1. Usuários de demonstração ────────────────────────────────────────
    const userIdByRole = new Map<UserRole, string>();

    for (const user of DEMO_USERS) {
      const passwordHash = await hash(config.passwords[user.passwordKey], ARGON2_OPTIONS);
      const email = user.email.toLowerCase();

      const saved = await prisma.user.upsert({
        where: { email },
        update: { name: user.name, role: user.role, isActive: true, passwordHash },
        create: { id: uuidv7(), name: user.name, email, role: user.role, passwordHash },
      });
      userIdByRole.set(user.role, saved.id);
    }
    console.log(`  usuários:      ${String(DEMO_USERS.length)} (ADMIN, MANAGER, OPERATOR)`);

    // ── 2. Categorias ──────────────────────────────────────────────────────
    const categoryIdByName = new Map<string, string>();

    for (const category of CATEGORIES) {
      const record = await prisma.category.upsert({
        where: { name: category.name },
        update: { description: category.description, isActive: true },
        create: { id: uuidv7(), name: category.name, description: category.description },
      });
      categoryIdByName.set(record.name, record.id);
    }
    console.log(`  categorias:    ${String(CATEGORIES.length)}`);

    // ── 3. Fornecedores fictícios (.invalid) ───────────────────────────────
    const supplierIds: string[] = [];

    for (const supplier of SUPPLIERS) {
      const record = await prisma.supplier.upsert({
        where: { taxId: supplier.taxId },
        update: {
          name: supplier.name,
          email: supplier.email,
          phone: supplier.phone,
          isActive: true,
        },
        create: { id: uuidv7(), ...supplier },
      });
      supplierIds.push(record.id);
    }
    console.log(`  fornecedores:  ${String(SUPPLIERS.length)}`);

    // ── 4. Produtos ────────────────────────────────────────────────────────
    const productBySku = new Map<string, { id: string; minStock: string }>();

    for (const [index, product] of PRODUCTS.entries()) {
      const categoryId = categoryIdByName.get(product.category);
      if (!categoryId) {
        throw new Error(`categoria "${product.category}" do produto ${product.sku} não encontrada`);
      }

      const supplierId = supplierIds[index % supplierIds.length];
      const sku = product.sku.toUpperCase();

      const record = await prisma.product.upsert({
        where: { sku },
        update: {
          name: product.name,
          categoryId,
          unit: product.unit,
          minStock: product.minStock,
          unitCost: product.unitCost,
          isActive: true,
          ...(supplierId !== undefined ? { supplierId } : {}),
        },
        create: {
          id: uuidv7(),
          sku,
          name: product.name,
          categoryId,
          unit: product.unit,
          currentStock: '0.000',
          minStock: product.minStock,
          unitCost: product.unitCost,
          ...(supplierId !== undefined ? { supplierId } : {}),
        },
      });
      productBySku.set(sku, { id: record.id, minStock: product.minStock });
    }
    console.log(`  produtos:      ${String(PRODUCTS.length)}`);

    // ── 5. Movimentações determinísticas via StockMovementsService ─────────
    const operatorId = userIdByRole.get(UserRole.OPERATOR);
    const managerId = userIdByRole.get(UserRole.MANAGER);

    if (!operatorId || !managerId) {
      throw new Error('usuários OPERATOR e MANAGER obrigatórios para assinar registros do seed.');
    }

    const silentLogger = {
      setContext: () => undefined,
      error: () => undefined,
      warn: () => undefined,
      info: () => undefined,
      debug: () => undefined,
      trace: () => undefined,
      fatal: () => undefined,
    } as unknown as PinoLogger;

    const audit = new AuditService(prisma as unknown as PrismaService, silentLogger);
    const movements = new StockMovementsService(prisma as unknown as PrismaService, audit);
    const inventories = new InventoriesService(prisma as unknown as PrismaService, audit);

    let createdMovements = 0;
    let skippedMovements = 0;

    for (const [index, product] of PRODUCTS.entries()) {
      const sku = product.sku.toUpperCase();
      const info = productBySku.get(sku);
      if (!info) {
        continue;
      }

      for (const plan of planMovementsForProduct(sku, info.minStock, index)) {
        const existing = await prisma.stockMovement.findFirst({
          where: { referenceDoc: plan.referenceDoc },
        });

        if (existing) {
          skippedMovements += 1;
          continue;
        }

        if (plan.type === 'IN') {
          await movements.createIn(
            {
              productId: info.id,
              quantity: plan.quantity,
              reason: plan.reason,
              referenceDoc: plan.referenceDoc,
              note: 'dado fictício de demonstração',
            },
            operatorId,
          );
        } else {
          await movements.createOut(
            {
              productId: info.id,
              quantity: plan.quantity,
              reason: plan.reason,
              referenceDoc: plan.referenceDoc,
              note: 'dado fictício de demonstração',
            },
            operatorId,
          );
        }
        createdMovements += 1;
      }
    }
    console.log(
      `  movimentações: ${String(createdMovements)} criadas, ${String(skippedMovements)} já existiam (idempotente)`,
    );

    // ── 6. Inventário aberto de demonstração (se ainda não existir) ────────
    const existingDemoInventory = await prisma.inventory.findFirst({
      where: { note: DEMO_INVENTORY_NOTE },
    });

    if (!existingDemoInventory) {
      const sampleSkus = ['FER-0002', 'FIX-0001', 'ELE-0001'];
      const sampleProductIds = sampleSkus
        .map((sku) => productBySku.get(sku)?.id)
        .filter((id): id is string => id !== undefined);

      if (sampleProductIds.length > 0) {
        const opened = await inventories.open(
          { productIds: sampleProductIds, note: DEMO_INVENTORY_NOTE },
          managerId,
        );
        console.log(`  inventário:    1 aberto (${opened.code})`);
      }
    } else {
      console.log(`  inventário:    já existia (${existingDemoInventory.code}, idempotente)`);
    }

    console.log('\nSeed de demonstração concluído com sucesso.');
  } finally {
    await prisma.$disconnect();
  }
}

const isDirectExecution = require.main === module;

if (isDirectExecution) {
  main().catch((error: unknown) => {
    console.error('\nSeed de demonstração falhou:');
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
