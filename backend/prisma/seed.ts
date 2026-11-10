/**
 * Seed de desenvolvimento.
 *
 * Todos os dados aqui são **declaradamente fictícios**. Nenhum nome de empresa
 * real, dado de terceiro ou processo interno de qualquer organização é usado.
 *
 * ─── Histórico de movimentações (D13, marco 5B) ────────────────────────────
 *
 * Completo nesta fase: cada movimento passa pelo `StockMovementsService`
 * real (nunca `INSERT` direto), então o saldo final é exatamente o que o
 * histórico explica — a reconciliação (`GET /reports/stock-reconciliation`)
 * aprova o resultado. `referenceDoc` determinístico (`SEED-<sku>-<n>`):
 * antes de criar, o seed verifica se aquele `referenceDoc` já existe, e pula
 * se existir — um seed interrompido no meio se completa na próxima execução
 * sem duplicar nada. As quantidades vêm de um gerador com semente fixa, para
 * que o histórico seja o mesmo em qualquer máquina. Nenhum movimento desta
 * fonte usa `number`/`parseFloat`/`Math.*` sobre o valor que vai para a API —
 * só para ESCOLHER a quantidade fictícia, nunca para gravá-la (a chamada ao
 * service sempre recebe uma string decimal).
 */
import { resolve } from 'node:path';
import { hash } from '@node-rs/argon2';
import { PrismaPg } from '@prisma/adapter-pg';
import { config as loadEnv } from 'dotenv';
import type { PinoLogger } from 'nestjs-pino';
import { v7 as uuidv7 } from 'uuid';
import { ARGON2_OPTIONS } from '../src/auth/auth.service';
import { MIN_PASSWORD_LENGTH } from '../src/auth/dto/login.dto';
import { AuditService } from '../src/audit/audit.service';
import { PrismaClient } from '../src/generated/prisma/client';
import { MovementReason, UnitOfMeasure, UserRole } from '../src/generated/prisma/enums';
import type { PrismaService } from '../src/prisma/prisma.service';
import { StockMovementsService } from '../src/stock-movements/stock-movements.service';

loadEnv({ path: resolve(process.cwd(), '../.env'), override: false, quiet: true });

/**
 * Recusa rodar contra produção.
 *
 * O seed cria contas de demonstração com senha vinda do `.env`. Em produção
 * isso é uma porta de entrada com credencial conhecida pela equipe inteira, e
 * o `upsert` por e-mail reativaria a conta mesmo que alguém a tivesse
 * inativado. Idempotência não é a mesma coisa que ser seguro reexecutar em
 * qualquer lugar: aqui o alvo é que precisa ser verificado.
 */
function assertAmbienteDeDesenvolvimento(): void {
  const env = process.env['NODE_ENV'];

  if (env === 'production') {
    throw new Error(
      'Seed recusado: NODE_ENV=production.\n' +
        'Este seed cria usuários de demonstração com senha de desenvolvimento. ' +
        'Popular produção é tarefa de migração de dados, não de seed.',
    );
  }
}

interface SeedUser {
  name: string;
  email: string;
  role: UserRole;
  passwordEnvVar: string;
}

const USERS: readonly SeedUser[] = [
  {
    name: 'Ana Administradora',
    email: 'admin@stockflow.local',
    role: UserRole.ADMIN,
    passwordEnvVar: 'SEED_ADMIN_PASSWORD',
  },
  {
    name: 'Bruno Gerente',
    email: 'gerente@stockflow.local',
    role: UserRole.MANAGER,
    passwordEnvVar: 'SEED_MANAGER_PASSWORD',
  },
  {
    name: 'Carla Operadora',
    email: 'operador@stockflow.local',
    role: UserRole.OPERATOR,
    passwordEnvVar: 'SEED_OPERATOR_PASSWORD',
  },
];

export const CATEGORIES: readonly { name: string; description: string }[] = [
  { name: 'Ferramentas manuais', description: 'Chaves, alicates, martelos e similares.' },
  { name: 'Fixadores', description: 'Parafusos, porcas, arruelas, buchas e rebites.' },
  { name: 'Elétrica', description: 'Cabos, conectores, disjuntores e fitas isolantes.' },
  { name: 'Hidráulica', description: 'Conexões, registros, vedantes e tubos.' },
  { name: 'EPI', description: 'Equipamento de proteção individual.' },
  { name: 'Limpeza', description: 'Produtos e materiais de limpeza industrial.' },
  { name: 'Lubrificantes', description: 'Óleos, graxas e desengripantes.' },
];

export const SUPPLIERS: readonly { name: string; taxId: string; email: string; phone: string }[] = [
  {
    name: 'Distribuidora Exemplo Norte',
    taxId: '11.111.111/0001-11',
    email: 'contato@exemplo-norte.invalid',
    phone: '(15) 3200-0001',
  },
  {
    name: 'Ferramentas Fictícias Ltda',
    taxId: '22.222.222/0001-22',
    email: 'vendas@ferramentas-ficticias.invalid',
    phone: '(15) 3200-0002',
  },
  {
    name: 'Suprimentos Modelo S.A.',
    taxId: '33.333.333/0001-33',
    email: 'comercial@suprimentos-modelo.invalid',
    phone: '(15) 3200-0003',
  },
  {
    name: 'Comercial Demonstração',
    taxId: '44.444.444/0001-44',
    email: 'atendimento@comercial-demo.invalid',
    phone: '(15) 3200-0004',
  },
  {
    name: 'Atacado Placeholder EIRELI',
    taxId: '55.555.555/0001-55',
    email: 'pedidos@atacado-placeholder.invalid',
    phone: '(15) 3200-0005',
  },
];

export interface SeedProduct {
  sku: string;
  name: string;
  category: string;
  unit: UnitOfMeasure;
  minStock: string;
  unitCost: string;
}

/**
 * Catálogo fictício.
 *
 * `minStock` e `unitCost` variam de propósito: o dashboard e o relatório de
 * estoque baixo precisam de produtos com mínimos diferentes para que a
 * classificação (normal / baixo / sem estoque) tenha o que diferenciar quando
 * as movimentações entrarem na Fase 5.
 */
export const PRODUCTS: readonly SeedProduct[] = [
  // Ferramentas manuais
  {
    sku: 'FER-0001',
    name: 'Chave de fenda 1/8" x 4"',
    category: 'Ferramentas manuais',
    unit: UnitOfMeasure.UN,
    minStock: '10.000',
    unitCost: '12.9000',
  },
  {
    sku: 'FER-0002',
    name: 'Chave Phillips 3/16" x 4"',
    category: 'Ferramentas manuais',
    unit: UnitOfMeasure.UN,
    minStock: '10.000',
    unitCost: '13.5000',
  },
  {
    sku: 'FER-0003',
    name: 'Alicate universal 8"',
    category: 'Ferramentas manuais',
    unit: UnitOfMeasure.UN,
    minStock: '6.000',
    unitCost: '38.7000',
  },
  {
    sku: 'FER-0004',
    name: 'Alicate de bico meia-cana 6"',
    category: 'Ferramentas manuais',
    unit: UnitOfMeasure.UN,
    minStock: '5.000',
    unitCost: '34.2000',
  },
  {
    sku: 'FER-0005',
    name: 'Martelo unha 27mm cabo madeira',
    category: 'Ferramentas manuais',
    unit: UnitOfMeasure.UN,
    minStock: '4.000',
    unitCost: '45.0000',
  },
  {
    sku: 'FER-0006',
    name: 'Jogo de chaves Allen 1,5 a 10mm',
    category: 'Ferramentas manuais',
    unit: UnitOfMeasure.BOX,
    minStock: '3.000',
    unitCost: '79.9000',
  },
  {
    sku: 'FER-0007',
    name: 'Trena 5m x 19mm',
    category: 'Ferramentas manuais',
    unit: UnitOfMeasure.UN,
    minStock: '8.000',
    unitCost: '27.5000',
  },
  {
    sku: 'FER-0008',
    name: 'Serra manual arco 12"',
    category: 'Ferramentas manuais',
    unit: UnitOfMeasure.UN,
    minStock: '4.000',
    unitCost: '52.3000',
  },

  // Fixadores
  {
    sku: 'FIX-0001',
    name: 'Parafuso sextavado M8 x 40mm',
    category: 'Fixadores',
    unit: UnitOfMeasure.UN,
    minStock: '500.000',
    unitCost: '0.8500',
  },
  {
    sku: 'FIX-0002',
    name: 'Parafuso sextavado M10 x 60mm',
    category: 'Fixadores',
    unit: UnitOfMeasure.UN,
    minStock: '400.000',
    unitCost: '1.4200',
  },
  {
    sku: 'FIX-0003',
    name: 'Porca sextavada M8',
    category: 'Fixadores',
    unit: UnitOfMeasure.UN,
    minStock: '600.000',
    unitCost: '0.3100',
  },
  {
    sku: 'FIX-0004',
    name: 'Arruela lisa M8',
    category: 'Fixadores',
    unit: UnitOfMeasure.UN,
    minStock: '800.000',
    unitCost: '0.1200',
  },
  {
    sku: 'FIX-0005',
    name: 'Arruela de pressão M10',
    category: 'Fixadores',
    unit: UnitOfMeasure.UN,
    minStock: '500.000',
    unitCost: '0.1800',
  },
  {
    sku: 'FIX-0006',
    name: 'Bucha de nylon S8',
    category: 'Fixadores',
    unit: UnitOfMeasure.PACK,
    minStock: '40.000',
    unitCost: '9.9000',
  },
  {
    sku: 'FIX-0007',
    name: 'Rebite de repuxo 4,0 x 10mm',
    category: 'Fixadores',
    unit: UnitOfMeasure.PACK,
    minStock: '25.000',
    unitCost: '18.4000',
  },
  {
    sku: 'FIX-0008',
    name: 'Parafuso autobrocante 4,2 x 19mm',
    category: 'Fixadores',
    unit: UnitOfMeasure.PACK,
    minStock: '30.000',
    unitCost: '14.7000',
  },

  // Elétrica
  {
    sku: 'ELE-0001',
    name: 'Cabo flexível 2,5mm² preto',
    category: 'Elétrica',
    unit: UnitOfMeasure.M,
    minStock: '200.000',
    unitCost: '2.3500',
  },
  {
    sku: 'ELE-0002',
    name: 'Cabo flexível 4,0mm² azul',
    category: 'Elétrica',
    unit: UnitOfMeasure.M,
    minStock: '150.000',
    unitCost: '3.8900',
  },
  {
    sku: 'ELE-0003',
    name: 'Disjuntor monopolar 16A curva C',
    category: 'Elétrica',
    unit: UnitOfMeasure.UN,
    minStock: '20.000',
    unitCost: '18.9000',
  },
  {
    sku: 'ELE-0004',
    name: 'Disjuntor tripolar 32A curva C',
    category: 'Elétrica',
    unit: UnitOfMeasure.UN,
    minStock: '10.000',
    unitCost: '87.5000',
  },
  {
    sku: 'ELE-0005',
    name: 'Fita isolante 19mm x 20m',
    category: 'Elétrica',
    unit: UnitOfMeasure.UN,
    minStock: '30.000',
    unitCost: '7.4000',
  },
  {
    sku: 'ELE-0006',
    name: 'Terminal tubular 2,5mm²',
    category: 'Elétrica',
    unit: UnitOfMeasure.PACK,
    minStock: '20.000',
    unitCost: '21.0000',
  },
  {
    sku: 'ELE-0007',
    name: 'Conector de emenda tipo wago 3 vias',
    category: 'Elétrica',
    unit: UnitOfMeasure.PACK,
    minStock: '15.000',
    unitCost: '32.6000',
  },

  // Hidráulica
  {
    sku: 'HID-0001',
    name: 'Joelho PVC 25mm 90°',
    category: 'Hidráulica',
    unit: UnitOfMeasure.UN,
    minStock: '60.000',
    unitCost: '1.9000',
  },
  {
    sku: 'HID-0002',
    name: 'Tê PVC 25mm',
    category: 'Hidráulica',
    unit: UnitOfMeasure.UN,
    minStock: '50.000',
    unitCost: '2.4500',
  },
  {
    sku: 'HID-0003',
    name: 'Registro esfera 3/4"',
    category: 'Hidráulica',
    unit: UnitOfMeasure.UN,
    minStock: '12.000',
    unitCost: '29.8000',
  },
  {
    sku: 'HID-0004',
    name: 'Veda rosca 18mm x 50m',
    category: 'Hidráulica',
    unit: UnitOfMeasure.UN,
    minStock: '25.000',
    unitCost: '6.7000',
  },
  {
    sku: 'HID-0005',
    name: 'Tubo PVC soldável 25mm barra 6m',
    category: 'Hidráulica',
    unit: UnitOfMeasure.UN,
    minStock: '15.000',
    unitCost: '34.9000',
  },
  {
    sku: 'HID-0006',
    name: 'Adesivo plástico PVC 175g',
    category: 'Hidráulica',
    unit: UnitOfMeasure.UN,
    minStock: '10.000',
    unitCost: '19.5000',
  },

  // EPI
  {
    sku: 'EPI-0001',
    name: 'Luva de vaqueta tamanho G',
    category: 'EPI',
    unit: UnitOfMeasure.UN,
    minStock: '40.000',
    unitCost: '16.8000',
  },
  {
    sku: 'EPI-0002',
    name: 'Luva nitrílica tamanho M',
    category: 'EPI',
    unit: UnitOfMeasure.PACK,
    minStock: '20.000',
    unitCost: '42.0000',
  },
  {
    sku: 'EPI-0003',
    name: 'Óculos de proteção incolor',
    category: 'EPI',
    unit: UnitOfMeasure.UN,
    minStock: '30.000',
    unitCost: '11.2000',
  },
  {
    sku: 'EPI-0004',
    name: 'Protetor auricular plug silicone',
    category: 'EPI',
    unit: UnitOfMeasure.UN,
    minStock: '50.000',
    unitCost: '3.9000',
  },
  {
    sku: 'EPI-0005',
    name: 'Capacete de segurança classe B branco',
    category: 'EPI',
    unit: UnitOfMeasure.UN,
    minStock: '15.000',
    unitCost: '38.5000',
  },
  {
    sku: 'EPI-0006',
    name: 'Bota de segurança bico composite nº 42',
    category: 'EPI',
    unit: UnitOfMeasure.UN,
    minStock: '8.000',
    unitCost: '139.9000',
  },

  // Limpeza
  {
    sku: 'LIM-0001',
    name: 'Detergente neutro concentrado 5L',
    category: 'Limpeza',
    unit: UnitOfMeasure.L,
    minStock: '40.000',
    unitCost: '4.3000',
  },
  {
    sku: 'LIM-0002',
    name: 'Desengraxante industrial 5L',
    category: 'Limpeza',
    unit: UnitOfMeasure.L,
    minStock: '30.000',
    unitCost: '9.8000',
  },
  {
    sku: 'LIM-0003',
    name: 'Pano de limpeza multiuso',
    category: 'Limpeza',
    unit: UnitOfMeasure.PACK,
    minStock: '20.000',
    unitCost: '13.4000',
  },
  {
    sku: 'LIM-0004',
    name: 'Saco de lixo 100L reforçado',
    category: 'Limpeza',
    unit: UnitOfMeasure.PACK,
    minStock: '25.000',
    unitCost: '27.9000',
  },

  // Lubrificantes
  {
    sku: 'LUB-0001',
    name: 'Óleo lubrificante ISO VG 68 20L',
    category: 'Lubrificantes',
    unit: UnitOfMeasure.L,
    minStock: '60.000',
    unitCost: '18.7000',
  },
  {
    sku: 'LUB-0002',
    name: 'Graxa de lítio EP2 1kg',
    category: 'Lubrificantes',
    unit: UnitOfMeasure.KG,
    minStock: '20.000',
    unitCost: '32.4000',
  },
  {
    sku: 'LUB-0003',
    name: 'Desengripante spray 300ml',
    category: 'Lubrificantes',
    unit: UnitOfMeasure.UN,
    minStock: '24.000',
    unitCost: '21.9000',
  },
];

function readSeedPassword(envVar: string): string {
  const value = process.env[envVar];

  if (!value) {
    throw new Error(
      `${envVar} não definida. Preencha o .env da raiz (modelo em .env.example).\n` +
        'O seed não usa senha padrão de propósito: senha padrão de desenvolvimento ' +
        'é exatamente o que acaba em produção.',
    );
  }

  if (value.length < MIN_PASSWORD_LENGTH) {
    throw new Error(
      `${envVar} tem ${value.length} caracteres. O mínimo da política é ${MIN_PASSWORD_LENGTH} (§8.1).`,
    );
  }

  return value;
}

export interface MovementPlan {
  type: 'IN' | 'OUT';
  quantity: string;
  reason: MovementReason;
  referenceDoc: string;
}

/**
 * Gerador determinístico simples (LCG de Lehmer), só para ESCOLHER a
 * quantidade fictícia de cada movimento do seed — nunca para gravá-la: a
 * chamada ao service sempre recebe uma string decimal (D13, §4 do plano da
 * Fase 5). Semente fixa por SKU: o mesmo catálogo produz o mesmo histórico em
 * qualquer máquina.
 */
function seededRandom(seed: number): () => number {
  let state = seed % 2147483647;

  if (state <= 0) {
    state += 2147483646;
  }

  return () => {
    state = (state * 16807) % 2147483647;

    return (state - 1) / 2147483646;
  };
}

function hashString(value: string): number {
  let hash = 0;

  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) | 0;
  }

  return Math.abs(hash) + 1;
}

function round3(value: number): string {
  return value.toFixed(3);
}

/**
 * Plano de movimentos fictícios de um produto, por índice no catálogo:
 *
 *  - `índice % 7 === 0`: nenhum movimento — fica SEM ESTOQUE, de propósito,
 *    para o relatório `GET /reports/out-of-stock` ter o que listar.
 *  - `índice % 5 === 0` (e não cai no caso acima): uma entrada só, entre 30%
 *    e 70% do mínimo — fica com ESTOQUE BAIXO, de propósito, para
 *    `GET /reports/low-stock` e o dashboard.
 *  - Caso normal: uma entrada confortável (150% a 300% do mínimo) e uma
 *    saída parcial depois (10% a 30% da entrada) — estoque normal, com
 *    histórico de duas movimentações.
 */
export function planMovementsForProduct(
  sku: string,
  minStock: string,
  index: number,
): MovementPlan[] {
  const rng = seededRandom(hashString(sku));
  const min = Number.parseFloat(minStock);

  if (index % 7 === 0) {
    return [];
  }

  if (index % 5 === 0) {
    const quantidade = min * (0.3 + rng() * 0.4);

    return [
      {
        type: 'IN',
        quantity: round3(quantidade),
        reason: MovementReason.PURCHASE,
        referenceDoc: `SEED-${sku}-1`,
      },
    ];
  }

  const entrada = min * (1.5 + rng() * 1.5);
  const saida = entrada * (0.1 + rng() * 0.2);

  return [
    {
      type: 'IN',
      quantity: round3(entrada),
      reason: MovementReason.PURCHASE,
      referenceDoc: `SEED-${sku}-1`,
    },
    {
      type: 'OUT',
      quantity: round3(saida),
      reason: MovementReason.SALE,
      referenceDoc: `SEED-${sku}-2`,
    },
  ];
}

async function main(): Promise<void> {
  assertAmbienteDeDesenvolvimento();

  const connectionString = process.env['DATABASE_URL'];

  if (!connectionString) {
    throw new Error('DATABASE_URL não definida.');
  }

  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

  try {
    console.log('Semeando dados fictícios de desenvolvimento...\n');

    // ── Usuários ───────────────────────────────────────────────────────────
    // Senhas lidas antes de qualquer escrita: se faltar uma variável, o seed
    // falha sem ter deixado o banco pela metade.
    const passwords = new Map(
      USERS.map((user) => [user.email, readSeedPassword(user.passwordEnvVar)]),
    );

    for (const user of USERS) {
      const passwordHash = await hash(passwords.get(user.email) ?? '', ARGON2_OPTIONS);
      const email = user.email.toLowerCase();

      await prisma.user.upsert({
        where: { email },
        // Senha não é reescrita em execução repetida: se alguém trocou a senha
        // no app, um novo `npm run seed` não deve desfazer isso.
        update: { name: user.name, role: user.role, isActive: true },
        create: { id: uuidv7(), name: user.name, email, role: user.role, passwordHash },
      });
    }
    console.log(`  usuários:      ${USERS.length} (um por papel)`);

    // ── Categorias ─────────────────────────────────────────────────────────
    const categoryIdByName = new Map<string, string>();

    for (const category of CATEGORIES) {
      const record = await prisma.category.upsert({
        where: { name: category.name },
        update: { description: category.description },
        create: { id: uuidv7(), name: category.name, description: category.description },
      });
      categoryIdByName.set(record.name, record.id);
    }
    console.log(`  categorias:    ${CATEGORIES.length}`);

    // ── Fornecedores ───────────────────────────────────────────────────────
    const supplierIds: string[] = [];

    for (const supplier of SUPPLIERS) {
      const record = await prisma.supplier.upsert({
        where: { taxId: supplier.taxId },
        update: { name: supplier.name, email: supplier.email, phone: supplier.phone },
        create: { id: uuidv7(), ...supplier },
      });
      supplierIds.push(record.id);
    }
    console.log(`  fornecedores:  ${SUPPLIERS.length}`);

    // ── Produtos ───────────────────────────────────────────────────────────
    const produtoPorSku = new Map<string, { id: string; minStock: string }>();

    for (const [index, product] of PRODUCTS.entries()) {
      const categoryId = categoryIdByName.get(product.category);

      if (!categoryId) {
        throw new Error(`categoria "${product.category}" do produto ${product.sku} não existe`);
      }

      // Distribuição determinística entre os fornecedores: um seed que sorteia
      // produz um banco diferente a cada execução, e aí dois desenvolvedores
      // não conseguem comparar o que estão vendo.
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
          ...(supplierId !== undefined ? { supplierId } : {}),
        },
        create: {
          id: uuidv7(),
          sku,
          name: product.name,
          categoryId,
          unit: product.unit,
          // Saldo zero: só a movimentação real, abaixo, muda o saldo.
          currentStock: '0.000',
          minStock: product.minStock,
          unitCost: product.unitCost,
          ...(supplierId !== undefined ? { supplierId } : {}),
        },
      });
      produtoPorSku.set(sku, { id: record.id, minStock: product.minStock });
    }
    console.log(`  produtos:      ${PRODUCTS.length}`);

    // ── Movimentações (D13, marco 5B) ───────────────────────────────────────
    const operador = USERS.find((u) => u.role === UserRole.OPERATOR);
    const operadorId = operador
      ? (await prisma.user.findUniqueOrThrow({ where: { email: operador.email.toLowerCase() } })).id
      : undefined;

    if (!operadorId) {
      throw new Error('usuário OPERATOR do seed não encontrado para assinar as movimentações.');
    }

    /**
     * `StockMovementsService` e `AuditService` são instanciados aqui à mão,
     * fora do contêiner de DI do Nest — `NestFactory.createApplicationContext`
     * foi tentado e descartado: o `AllExceptionsFilter` (provider global)
     * chama `logger.setContext(...)` de um `PinoLogger` que só é montado de
     * verdade pelo bootstrap HTTP completo (`main.ts`), e falha fora dele. Os
     * dois services usados aqui não dependem de HTTP nem de guard algum — só
     * do `PrismaService` (que o `prisma` já criado acima satisfaz
     * estruturalmente) e de um logger, que aqui é um stub silencioso. O
     * `PrismaClient` que os dois de fato chamam em tempo de execução é o mesmo
     * `prisma` que o resto do seed usa.
     */
    const loggerSilencioso = {
      setContext: () => undefined,
      error: () => undefined,
      warn: () => undefined,
      info: () => undefined,
      debug: () => undefined,
      trace: () => undefined,
      fatal: () => undefined,
    } as unknown as PinoLogger;
    const audit = new AuditService(prisma as unknown as PrismaService, loggerSilencioso);
    const movements = new StockMovementsService(prisma as unknown as PrismaService, audit);

    let criadas = 0;
    let puladas = 0;

    for (const [index, product] of PRODUCTS.entries()) {
      const sku = product.sku.toUpperCase();
      const info = produtoPorSku.get(sku);

      if (!info) {
        continue;
      }

      for (const plano of planMovementsForProduct(sku, info.minStock, index)) {
        const existente = await prisma.stockMovement.findFirst({
          where: { referenceDoc: plano.referenceDoc },
        });

        if (existente) {
          puladas += 1;
          continue;
        }

        if (plano.type === 'IN') {
          await movements.createIn(
            {
              productId: info.id,
              quantity: plano.quantity,
              reason: plano.reason,
              referenceDoc: plano.referenceDoc,
              note: 'dado fictício de demonstração',
            },
            operadorId,
          );
        } else {
          await movements.createOut(
            {
              productId: info.id,
              quantity: plano.quantity,
              reason: plano.reason,
              referenceDoc: plano.referenceDoc,
              note: 'dado fictício de demonstração',
            },
            operadorId,
          );
        }
        criadas += 1;
      }
    }

    console.log(
      `  movimentações: ${String(criadas)} criadas, ${String(puladas)} já existiam (idempotente)`,
    );

    console.log('\nCredenciais de acesso: os e-mails acima, com as senhas definidas');
    console.log('em SEED_*_PASSWORD no .env.\n');
  } finally {
    await prisma.$disconnect();
  }
}

const isDirectExecution = require.main === module;

if (isDirectExecution) {
  main().catch((error: unknown) => {
    console.error('\nSeed falhou:');
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
