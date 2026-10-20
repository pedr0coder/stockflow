import { AlertTriangle, Boxes, PackageX, Package } from 'lucide-react';
import type { ReactNode } from 'react';
import { PageHeader } from '@/components/shared/PageHeader';
import { StatCard } from '@/components/shared/StatCard';
import { EmptyState } from '@/components/shared/EmptyState';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

/**
 * Dashboard.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ NENHUM NÚMERO NESTA TELA É INVENTADO.                                    │
 * │                                                                          │
 * │ Os indicadores vêm de `GET /dashboard/summary`, que agrega por SQL       │
 * │ (docs/05-api.md §5.9) e é entrega da Fase 5, ligado à tela na Fase 6.    │
 * │ Até lá, cada indicador mostra o estado vazio dizendo o que falta.        │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Por que estado vazio e não skeleton: skeleton comunica "carregando", e nada
 * está carregando. Um skeleton permanente é tão enganoso quanto um número
 * falso, só que mais sutil. Os skeletons existem, são usados pelos mesmos
 * componentes e podem ser vistos em `/design-system`.
 *
 * O layout aqui é o final. Quando a query entrar, o `state` de cada `StatCard`
 * passa de `empty` para `loading` e depois `ready`, e nada mais muda.
 */

const EMPTY_REASON = 'Disponível quando houver movimentação registrada.';

export function DashboardPage(): ReactNode {
  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Dashboard"
        description="Visão geral do estoque: totais, alertas e movimentações recentes."
      />

      <section aria-labelledby="indicadores" className="flex flex-col gap-3">
        <h2 id="indicadores" className="sr-only">
          Indicadores
        </h2>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label="Produtos cadastrados"
            icon={Package}
            state={{ status: 'empty', reason: 'Disponível quando houver produto cadastrado.' }}
          />
          <StatCard
            label="Itens em estoque"
            icon={Boxes}
            state={{ status: 'empty', reason: EMPTY_REASON }}
          />
          <StatCard
            label="Estoque baixo"
            icon={AlertTriangle}
            tone="warning"
            state={{ status: 'empty', reason: EMPTY_REASON }}
          />
          <StatCard
            label="Sem estoque"
            icon={PackageX}
            tone="danger"
            state={{ status: 'empty', reason: EMPTY_REASON }}
          />
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-5">
        <Card className="border shadow-none lg:col-span-3">
          <CardHeader>
            <CardTitle className="text-base">Movimentações por período</CardTitle>
          </CardHeader>
          <CardContent>
            <EmptyState
              title="Sem movimentações no período"
              description="O gráfico aparece quando houver entradas e saídas registradas. A movimentação de estoque é entrega da Fase 5."
            />
          </CardContent>
        </Card>

        <Card className="border shadow-none lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Movimentações recentes</CardTitle>
          </CardHeader>
          <CardContent>
            <EmptyState
              title="Nenhuma movimentação"
              description="As últimas entradas, saídas e ajustes aparecem aqui, com produto, quantidade e autor."
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
