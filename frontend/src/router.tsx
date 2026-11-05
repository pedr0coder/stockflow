import { lazy, Suspense, type ComponentType, type ReactNode } from 'react';
import { createBrowserRouter, Navigate, type RouteObject } from 'react-router';
import { AppShell } from '@/app/layouts/AppShell';
import { AuthLayout } from '@/app/layouts/AuthLayout';
import { PageLoader } from '@/components/shared/PageLoader';
import { PhasePlaceholder } from '@/components/shared/PhasePlaceholder';
import { ProtectedRoute } from '@/features/auth/ProtectedRoute';
import { RoleGuard } from '@/features/auth/RoleGuard';
import type { UserRole } from '@/types/auth';

/**
 * Code-splitting por rota (Marco 7C, M7C-1).
 *
 * Só o que precisa existir antes de qualquer página fica no chunk de entrada:
 * `AuthLayout`, `AppShell`, `ProtectedRoute` e `RoleGuard`. A verificação de
 * sessão, o RBAC e o esqueleto (sidebar + cabeçalho) nunca esperam por rede
 * nem piscam. Cada página vira um chunk próprio, baixado na primeira visita.
 *
 * As páginas são exportações nomeadas (não `default`), então o adaptador
 * `{ default: module[name] }` é o que `React.lazy` exige. O `Suspense` fica em
 * volta de cada página, e não acima do `AppShell`, para que o fallback ocupe
 * apenas a área de conteúdo.
 */
function lazyPage<K extends string>(
  load: () => Promise<Record<K, ComponentType>>,
  name: K,
): ReactNode {
  const Page = lazy<ComponentType>(async () => {
    const module = await load();
    const component: ComponentType = module[name];

    return { default: component };
  });

  return (
    <Suspense fallback={<PageLoader />}>
      <Page />
    </Suspense>
  );
}

const auditPage = lazyPage(() => import('@/features/audit/pages/AuditPage'), 'AuditPage');
const loginPage = lazyPage(() => import('@/features/auth/pages/LoginPage'), 'LoginPage');
const categoriesPage = lazyPage(
  () => import('@/features/categories/pages/CategoriesPage'),
  'CategoriesPage',
);
const dashboardPage = lazyPage(
  () => import('@/features/dashboard/pages/DashboardPage'),
  'DashboardPage',
);
const inventoryDetailPage = lazyPage(
  () => import('@/features/inventories/pages/InventoryDetailPage'),
  'InventoryDetailPage',
);
const inventoryNewPage = lazyPage(
  () => import('@/features/inventories/pages/InventoryNewPage'),
  'InventoryNewPage',
);
const inventoriesPage = lazyPage(
  () => import('@/features/inventories/pages/InventoriesPage'),
  'InventoriesPage',
);
const productDetailPage = lazyPage(
  () => import('@/features/products/pages/ProductDetailPage'),
  'ProductDetailPage',
);
const productEditPage = lazyPage(
  () => import('@/features/products/pages/ProductEditPage'),
  'ProductEditPage',
);
const productNewPage = lazyPage(
  () => import('@/features/products/pages/ProductNewPage'),
  'ProductNewPage',
);
const productsPage = lazyPage(
  () => import('@/features/products/pages/ProductsPage'),
  'ProductsPage',
);
const reportsPage = lazyPage(() => import('@/features/reports/pages/ReportsPage'), 'ReportsPage');
const movementNewPage = lazyPage(
  () => import('@/features/stock-movements/pages/MovementNewPage'),
  'MovementNewPage',
);
const movementsPage = lazyPage(
  () => import('@/features/stock-movements/pages/MovementsPage'),
  'MovementsPage',
);
const supplierDetailPage = lazyPage(
  () => import('@/features/suppliers/pages/SupplierDetailPage'),
  'SupplierDetailPage',
);
const supplierNewPage = lazyPage(
  () => import('@/features/suppliers/pages/SupplierNewPage'),
  'SupplierNewPage',
);
const suppliersPage = lazyPage(
  () => import('@/features/suppliers/pages/SuppliersPage'),
  'SuppliersPage',
);
const userDetailPage = lazyPage(
  () => import('@/features/users/pages/UserDetailPage'),
  'UserDetailPage',
);
const userNewPage = lazyPage(() => import('@/features/users/pages/UserNewPage'), 'UserNewPage');
const usersPage = lazyPage(() => import('@/features/users/pages/UsersPage'), 'UsersPage');
const designSystemPage = lazyPage(() => import('@/pages/DesignSystemPage'), 'DesignSystemPage');
const notFoundPage = lazyPage(() => import('@/pages/NotFoundPage'), 'NotFoundPage');

/**
 * Rotas da aplicação, seguindo o mapa de telas (docs/06-mvp-e-telas.md §6.2).
 *
 * Todas as rotas do mapa existem e navegam. As que ainda não têm funcionalidade
 * renderizam um `PhasePlaceholder` nomeando a fase do roadmap que as entrega.
 *
 * Por que não deixá-las de fora: o item da sidebar precisa levar a algum lugar,
 * e item de menu que não navega é botão sem função, o que o design system
 * proíbe (§6.4). Por que não um "em breve": "em breve" é promessa vaga; a fase
 * é verificável contra o roadmap versionado neste repositório.
 */

interface PlaceholderRoute {
  path: string;
  title: string;
  description: string;
  phase: number;
  willDeliver: string;
  /**
   * Papéis autorizados, conforme `lib/nav-items.ts` e `docs/05-api.md`.
   * `undefined` = os três papéis (nenhuma restrição de interface).
   */
  roles?: readonly UserRole[];
}

const PLACEHOLDER_ROUTES: readonly PlaceholderRoute[] = [
  {
    path: 'profile',
    title: 'Meu perfil',
    description: 'Seus dados e troca de senha.',
    phase: 4,
    willDeliver: 'Dados da conta e troca da própria senha, exigindo a senha atual.',
  },
];

/**
 * Rotas sem restrição de papel ficam soltas; as com `roles` ganham um
 * `RoleGuard` pathless (sem `path` próprio) como pai, agrupadas pela MESMA
 * lista de papéis — react-router aceita rota sem `path` como camada de
 * composição pura.
 */
const openPlaceholderRoutes: RouteObject[] = PLACEHOLDER_ROUTES.filter(
  (route) => route.roles === undefined,
).map((route) => ({
  path: route.path,
  element: (
    <PhasePlaceholder
      title={route.title}
      description={route.description}
      phase={route.phase}
      willDeliver={route.willDeliver}
    />
  ),
}));

const guardedPlaceholderRoutes: RouteObject[] = PLACEHOLDER_ROUTES.filter(
  (route) => route.roles !== undefined,
).map((route) => ({
  element: <RoleGuard roles={route.roles ?? []} />,
  children: [
    {
      path: route.path,
      element: (
        <PhasePlaceholder
          title={route.title}
          description={route.description}
          phase={route.phase}
          willDeliver={route.willDeliver}
        />
      ),
    },
  ],
}));

const placeholderRoutes: RouteObject[] = [...openPlaceholderRoutes, ...guardedPlaceholderRoutes];

export const router = createBrowserRouter([
  {
    element: <AuthLayout />,
    children: [{ path: '/login', element: loginPage }],
  },
  {
    element: <ProtectedRoute />,
    children: [
      {
        path: '/',
        element: <AppShell />,
        children: [
          { index: true, element: <Navigate to="/dashboard" replace /> },
          { path: 'dashboard', element: dashboardPage },
          { path: 'categories', element: categoriesPage },
          { path: 'products', element: productsPage },
          { path: 'products/new', element: productNewPage },
          { path: 'products/:id', element: productDetailPage },
          { path: 'products/:id/edit', element: productEditPage },
          { path: 'suppliers', element: suppliersPage },
          { path: 'suppliers/new', element: supplierNewPage },
          { path: 'suppliers/:id', element: supplierDetailPage },
          { path: 'movements', element: movementsPage },
          { path: 'movements/new', element: movementNewPage },
          { path: 'inventories', element: inventoriesPage },
          { path: 'inventories/new', element: inventoryNewPage },
          { path: 'inventories/:id', element: inventoryDetailPage },
          { path: 'reports', element: reportsPage },
          {
            element: <RoleGuard roles={['ADMIN', 'MANAGER']} />,
            children: [
              { path: 'users', element: usersPage },
              { path: 'users/new', element: userNewPage },
              { path: 'users/:id', element: userDetailPage },
            ],
          },
          {
            element: <RoleGuard roles={['ADMIN']} />,
            children: [{ path: 'audit', element: auditPage }],
          },
          /**
           * Vitrine do design system.
           *
           * Fica dentro do shell de propósito: é assim que os componentes
           * aparecem no contexto real em que são usados. Ela existe para
           * tornar verificável o critério de aceite de ter os quatro estados
           * visíveis em um lugar só, e some quando o projeto tiver telas de
           * verdade exercitando os mesmos componentes.
           */
          { path: 'design-system', element: designSystemPage },
          ...placeholderRoutes,
        ],
      },
    ],
  },
  { path: '*', element: notFoundPage },
]);
