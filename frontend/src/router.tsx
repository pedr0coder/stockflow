import { createBrowserRouter, Navigate, type RouteObject } from 'react-router';
import { AppShell } from '@/app/layouts/AppShell';
import { AuthLayout } from '@/app/layouts/AuthLayout';
import { PhasePlaceholder } from '@/components/shared/PhasePlaceholder';
import { AuditPage } from '@/features/audit/pages/AuditPage';
import { LoginPage } from '@/features/auth/pages/LoginPage';
import { ProtectedRoute } from '@/features/auth/ProtectedRoute';
import { RoleGuard } from '@/features/auth/RoleGuard';
import { CategoriesPage } from '@/features/categories/pages/CategoriesPage';
import { DashboardPage } from '@/features/dashboard/pages/DashboardPage';
import { InventoryDetailPage } from '@/features/inventories/pages/InventoryDetailPage';
import { InventoryNewPage } from '@/features/inventories/pages/InventoryNewPage';
import { InventoriesPage } from '@/features/inventories/pages/InventoriesPage';
import { ProductDetailPage } from '@/features/products/pages/ProductDetailPage';
import { ProductEditPage } from '@/features/products/pages/ProductEditPage';
import { ProductNewPage } from '@/features/products/pages/ProductNewPage';
import { ProductsPage } from '@/features/products/pages/ProductsPage';
import { ReportsPage } from '@/features/reports/pages/ReportsPage';
import { MovementNewPage } from '@/features/stock-movements/pages/MovementNewPage';
import { MovementsPage } from '@/features/stock-movements/pages/MovementsPage';
import { SupplierDetailPage } from '@/features/suppliers/pages/SupplierDetailPage';
import { SupplierNewPage } from '@/features/suppliers/pages/SupplierNewPage';
import { SuppliersPage } from '@/features/suppliers/pages/SuppliersPage';
import { UserDetailPage } from '@/features/users/pages/UserDetailPage';
import { UserNewPage } from '@/features/users/pages/UserNewPage';
import { UsersPage } from '@/features/users/pages/UsersPage';
import { DesignSystemPage } from '@/pages/DesignSystemPage';
import { NotFoundPage } from '@/pages/NotFoundPage';
import type { UserRole } from '@/types/auth';

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
    children: [{ path: '/login', element: <LoginPage /> }],
  },
  {
    element: <ProtectedRoute />,
    children: [
      {
        path: '/',
        element: <AppShell />,
        children: [
          { index: true, element: <Navigate to="/dashboard" replace /> },
          { path: 'dashboard', element: <DashboardPage /> },
          { path: 'categories', element: <CategoriesPage /> },
          { path: 'products', element: <ProductsPage /> },
          { path: 'products/new', element: <ProductNewPage /> },
          { path: 'products/:id', element: <ProductDetailPage /> },
          { path: 'products/:id/edit', element: <ProductEditPage /> },
          { path: 'suppliers', element: <SuppliersPage /> },
          { path: 'suppliers/new', element: <SupplierNewPage /> },
          { path: 'suppliers/:id', element: <SupplierDetailPage /> },
          { path: 'movements', element: <MovementsPage /> },
          { path: 'movements/new', element: <MovementNewPage /> },
          { path: 'inventories', element: <InventoriesPage /> },
          { path: 'inventories/new', element: <InventoryNewPage /> },
          { path: 'inventories/:id', element: <InventoryDetailPage /> },
          { path: 'reports', element: <ReportsPage /> },
          {
            element: <RoleGuard roles={['ADMIN', 'MANAGER']} />,
            children: [
              { path: 'users', element: <UsersPage /> },
              { path: 'users/new', element: <UserNewPage /> },
              { path: 'users/:id', element: <UserDetailPage /> },
            ],
          },
          {
            element: <RoleGuard roles={['ADMIN']} />,
            children: [{ path: 'audit', element: <AuditPage /> }],
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
          { path: 'design-system', element: <DesignSystemPage /> },
          ...placeholderRoutes,
        ],
      },
    ],
  },
  { path: '*', element: <NotFoundPage /> },
]);
