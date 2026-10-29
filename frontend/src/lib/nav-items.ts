import {
  Boxes,
  ClipboardList,
  FileText,
  LayoutDashboard,
  Package,
  Palette,
  ScrollText,
  Shapes,
  Truck,
  Users,
} from 'lucide-react';
import type { ComponentType } from 'react';
import type { UserRole } from '@/types/auth';

/**
 * Itens de navegação da sidebar.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ ATENÇÃO                                                                  │
 * │                                                                          │
 * │ O campo `roles` abaixo é CONVENIÊNCIA DE INTERFACE, não autorização.     │
 * │                                                                          │
 * │ Esconder um item da sidebar não protege absolutamente nada: a API é      │
 * │ chamável direto, com curl, sem passar por esta tela. A autorização real  │
 * │ é verificada no servidor, por guard, e é entrega da Fase 4               │
 * │ (docs/08-seguranca.md §8.3).                                             │
 * │                                                                          │
 * │ Se algum dia esta lista for a única coisa impedindo um OPERATOR de       │
 * │ executar uma ação de ADMIN, o sistema está inseguro.                     │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export interface NavItem {
  to: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  /** Papéis que veem o item. Ver o aviso acima. */
  roles: readonly UserRole[];
  /** Fase que entrega a funcionalidade. `null` quando já está entregue. */
  deliveredInPhase: number | null;
}

const ALL_ROLES = ['ADMIN', 'MANAGER', 'OPERATOR'] as const;
const ADMIN_AND_MANAGER = ['ADMIN', 'MANAGER'] as const;
const ADMIN_ONLY = ['ADMIN'] as const;

export interface NavGroup {
  label: string | null;
  items: readonly NavItem[];
}

/**
 * A matriz de papéis segue o mapa de telas (docs/06-mvp-e-telas.md §6.2) e a
 * tabela de permissões da API (docs/05-api.md).
 */
export const NAV_GROUPS: readonly NavGroup[] = [
  {
    label: null,
    items: [
      {
        to: '/dashboard',
        label: 'Dashboard',
        icon: LayoutDashboard,
        roles: ALL_ROLES,
        deliveredInPhase: null,
      },
    ],
  },
  {
    label: 'Cadastros',
    items: [
      {
        to: '/products',
        label: 'Produtos',
        icon: Package,
        roles: ALL_ROLES,
        deliveredInPhase: null,
      },
      {
        to: '/categories',
        label: 'Categorias',
        icon: Shapes,
        roles: ALL_ROLES,
        deliveredInPhase: null,
      },
      {
        to: '/suppliers',
        label: 'Fornecedores',
        icon: Truck,
        roles: ALL_ROLES,
        deliveredInPhase: null,
      },
    ],
  },
  {
    label: 'Estoque',
    items: [
      {
        to: '/movements',
        label: 'Movimentações',
        icon: Boxes,
        roles: ALL_ROLES,
        deliveredInPhase: null,
      },
      {
        to: '/inventories',
        label: 'Inventários',
        icon: ClipboardList,
        roles: ALL_ROLES,
        deliveredInPhase: null,
      },
      {
        to: '/reports',
        label: 'Relatórios',
        icon: FileText,
        roles: ALL_ROLES,
        deliveredInPhase: null,
      },
    ],
  },
  {
    label: 'Administração',
    items: [
      {
        to: '/users',
        label: 'Usuários',
        icon: Users,
        roles: ADMIN_AND_MANAGER,
        deliveredInPhase: null,
      },
      {
        to: '/audit',
        label: 'Auditoria',
        icon: ScrollText,
        roles: ADMIN_ONLY,
        deliveredInPhase: null,
      },
    ],
  },
  {
    label: 'Projeto',
    items: [
      {
        /**
         * Vitrine do design system. Não é tela de negócio: é o catálogo dos
         * componentes e dos quatro estados, e some quando houver telas reais
         * exercitando os mesmos componentes.
         */
        to: '/design-system',
        label: 'Design system',
        icon: Palette,
        roles: ALL_ROLES,
        deliveredInPhase: null,
      },
    ],
  },
];

/** Itens visíveis para um papel, preservando os grupos e descartando os vazios. */
export function navGroupsForRole(role: UserRole): NavGroup[] {
  return NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => item.roles.includes(role)),
  })).filter((group) => group.items.length > 0);
}
