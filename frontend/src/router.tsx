import { createBrowserRouter, Navigate, type RouteObject } from 'react-router';
import { AppShell } from '@/app/layouts/AppShell';
import { AuthLayout } from '@/app/layouts/AuthLayout';
import { PhasePlaceholder } from '@/components/shared/PhasePlaceholder';
import { LoginPage } from '@/features/auth/pages/LoginPage';
import { ProtectedRoute } from '@/features/auth/ProtectedRoute';
import { DashboardPage } from '@/features/dashboard/pages/DashboardPage';
import { DesignSystemPage } from '@/pages/DesignSystemPage';
import { NotFoundPage } from '@/pages/NotFoundPage';

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
}

const PLACEHOLDER_ROUTES: readonly PlaceholderRoute[] = [
  {
    path: 'products',
    title: 'Produtos',
    description: 'Catálogo com saldo atual, estoque mínimo, categoria e fornecedor.',
    phase: 4,
    willDeliver:
      'Listagem com busca, filtro por categoria e situação de estoque, ordenação, paginação e histórico por produto.',
  },
  {
    path: 'products/new',
    title: 'Novo produto',
    description: 'Cadastro de produto.',
    phase: 4,
    willDeliver: 'Formulário de cadastro com SKU único, unidade de medida e estoque mínimo.',
  },
  {
    path: 'products/:id',
    title: 'Detalhe do produto',
    description: 'Dados cadastrais e histórico de movimentações.',
    phase: 4,
    willDeliver: 'Abas com os dados do produto e o extrato de movimentações, em ordem decrescente.',
  },
  {
    path: 'products/:id/edit',
    title: 'Editar produto',
    description: 'Alteração dos dados cadastrais.',
    phase: 4,
    willDeliver:
      'Edição dos dados cadastrais. O saldo não é editável aqui: ele só muda por movimentação.',
  },
  {
    path: 'categories',
    title: 'Categorias',
    description: 'Classificação dos produtos do estoque.',
    phase: 4,
    willDeliver:
      'Cadastro, edição e inativação, com bloqueio de inativar categoria que tem produto ativo.',
  },
  {
    path: 'suppliers',
    title: 'Fornecedores',
    description: 'Fornecedores vinculados aos produtos.',
    phase: 4,
    willDeliver: 'Cadastro com CNPJ único, contato e a lista de produtos vinculados.',
  },
  {
    path: 'suppliers/new',
    title: 'Novo fornecedor',
    description: 'Cadastro de fornecedor.',
    phase: 4,
    willDeliver: 'Formulário de cadastro com validação de documento.',
  },
  {
    path: 'suppliers/:id',
    title: 'Detalhe do fornecedor',
    description: 'Dados do fornecedor e produtos vinculados.',
    phase: 4,
    willDeliver: 'Dados cadastrais e a lista de produtos que vêm deste fornecedor.',
  },
  {
    path: 'movements',
    title: 'Movimentações',
    description: 'Histórico imutável de entradas, saídas e ajustes.',
    phase: 5,
    willDeliver:
      'Extrato global com filtro por produto, tipo, motivo, autor e período. O histórico não é editável, por desenho.',
  },
  {
    path: 'movements/new',
    title: 'Nova movimentação',
    description: 'Registro de entrada, saída ou ajuste.',
    phase: 5,
    willDeliver:
      'Lançamento com atualização transacional do saldo, recusando saída acima do disponível.',
  },
  {
    path: 'inventories',
    title: 'Inventários',
    description: 'Contagens físicas e divergências apuradas.',
    phase: 5,
    willDeliver: 'Abertura, contagem, cálculo de divergência e aprovação dos ajustes.',
  },
  {
    path: 'inventories/new',
    title: 'Novo inventário',
    description: 'Abertura de contagem.',
    phase: 5,
    willDeliver: 'Seleção dos produtos a contar e abertura do inventário.',
  },
  {
    path: 'inventories/:id',
    title: 'Detalhe do inventário',
    description: 'Contagem, divergências e aprovação.',
    phase: 5,
    willDeliver:
      'Registro da quantidade contada, divergência calculada e aprovação em transação única.',
  },
  {
    path: 'reports',
    title: 'Relatórios',
    description: 'Estoque baixo, sem estoque, movimentações e divergências.',
    phase: 5,
    willDeliver: 'Seis relatórios, incluindo a reconciliação entre saldo e soma das movimentações.',
  },
  {
    path: 'users',
    title: 'Usuários',
    description: 'Contas de acesso e seus papéis.',
    phase: 4,
    willDeliver:
      'Cadastro, alteração de papel e inativação, com cada ação registrada na auditoria.',
  },
  {
    path: 'audit',
    title: 'Auditoria',
    description: 'Registro das ações relevantes do sistema.',
    phase: 4,
    willDeliver:
      'Consulta somente leitura do log, com autor, ação, entidade e estado anterior e posterior.',
  },
  {
    path: 'profile',
    title: 'Meu perfil',
    description: 'Seus dados e troca de senha.',
    phase: 4,
    willDeliver: 'Dados da conta e troca da própria senha, exigindo a senha atual.',
  },
];

const placeholderRoutes: RouteObject[] = PLACEHOLDER_ROUTES.map((route) => ({
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
