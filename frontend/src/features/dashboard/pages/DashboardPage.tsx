import { AlertTriangle, Boxes, PackageX, Package } from 'lucide-react';
import { lazy, Suspense, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { EmptyState } from '@/components/shared/EmptyState';
import { ErrorState } from '@/components/shared/ErrorState';
import { MovementTypeBadge } from '@/components/shared/MovementTypeBadge';
import { PageHeader } from '@/components/shared/PageHeader';
import { StatCard, type StatCardState } from '@/components/shared/StatCard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import {
  useDashboardSummaryQuery,
  useMovementsChartQuery,
  useRecentMovementsQuery,
} from '@/features/dashboard/queries';
import { ApiError } from '@/lib/api-client';
import { formatDateTime, formatQuantity } from '@/lib/format';

/**
 * O gráfico (`recharts` + `d3-*`) é a maior dependência do bundle e só existe
 * nesta tela (Marco 7C, M7C-1). Carregá-lo sob demanda deixa os indicadores e
 * a lista de movimentações recentes renderizarem sem esperar a engine gráfica.
 */
const MovementsChart = lazy(async () => {
  const module = await import('@/features/dashboard/components/MovementsChart');

  return { default: module.MovementsChart };
});

const RECENT_LIMIT = 10;
const PERIOD_OPTIONS = [
  { value: 7, label: 'Últimos 7 dias' },
  { value: 30, label: 'Últimos 30 dias' },
  { value: 90, label: 'Últimos 90 dias' },
] as const;

/**
 * Dashboard, com dado real.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ NENHUM NÚMERO NESTA TELA É INVENTADO.                                    │
 * │                                                                          │
 * │ Os indicadores vêm de `GET /dashboard/summary`, o gráfico de             │
 * │ `GET /dashboard/movements-chart` e a lista de `GET /dashboard/recent-    │
 * │ movements` — todos agregados por SQL no servidor (docs/05-api.md §5.9).  │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Os quatro indicadores foram renomeados em relação ao placeholder da Fase 3
 * ("Produtos cadastrados" / "Itens em estoque"): o contrato real de
 * `DashboardSummaryDto` é `activeProducts`/`lowStock`/`outOfStock`/
 * `movementsLast30Days` — não existe um agregado de "itens em estoque"
 * (soma de saldo), e "cadastrados" contava produtos inativos, que o backend
 * não inclui. Divergência registrada em docs/18-plano-fase-6.md (Marco 6B);
 * nenhuma mudança de contrato, só o rótulo da tela alinhado ao que a API
 * de fato calcula.
 */
export function DashboardPage(): ReactNode {
  const [days, setDays] = useState<number>(30);

  const summaryQuery = useDashboardSummaryQuery();
  const chartQuery = useMovementsChartQuery(days);
  const recentQuery = useRecentMovementsQuery(RECENT_LIMIT);

  function statState(
    value: number | undefined,
    isPending: boolean,
    isError: boolean,
  ): StatCardState {
    if (isPending) {
      return { status: 'loading' };
    }

    if (isError || value === undefined) {
      return { status: 'empty', reason: 'Não foi possível carregar este indicador.' };
    }

    return { status: 'ready', value: value.toLocaleString('pt-BR') };
  }

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
            label="Produtos ativos"
            icon={Package}
            state={statState(
              summaryQuery.data?.activeProducts,
              summaryQuery.isPending,
              summaryQuery.isError,
            )}
          />
          <StatCard
            label="Movimentações (30 dias)"
            icon={Boxes}
            state={statState(
              summaryQuery.data?.movementsLast30Days,
              summaryQuery.isPending,
              summaryQuery.isError,
            )}
          />
          <StatCard
            label="Estoque baixo"
            icon={AlertTriangle}
            tone="warning"
            state={statState(
              summaryQuery.data?.lowStock,
              summaryQuery.isPending,
              summaryQuery.isError,
            )}
          />
          <StatCard
            label="Sem estoque"
            icon={PackageX}
            tone="danger"
            state={statState(
              summaryQuery.data?.outOfStock,
              summaryQuery.isPending,
              summaryQuery.isError,
            )}
          />
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-5">
        <Card className="border shadow-none lg:col-span-3">
          <CardHeader className="flex flex-row items-center justify-between gap-2">
            <CardTitle className="text-base">Movimentações por período</CardTitle>
            <Select
              value={String(days)}
              onValueChange={(value) => {
                setDays(Number(value));
              }}
            >
              <SelectTrigger size="sm" className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PERIOD_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={String(option.value)}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </CardHeader>
          <CardContent>
            {chartQuery.isPending ? (
              <Skeleton className="h-[280px] w-full" />
            ) : chartQuery.isError ? (
              <ErrorState
                {...(chartQuery.error instanceof ApiError && chartQuery.error.code !== undefined
                  ? { code: chartQuery.error.code }
                  : {})}
                onRetry={() => void chartQuery.refetch()}
              />
            ) : chartQuery.data === undefined || chartQuery.data.length === 0 ? (
              <EmptyState
                title="Sem movimentações no período"
                description="O gráfico aparece quando houver entradas e saídas registradas no período selecionado."
              />
            ) : (
              <Suspense fallback={<Skeleton className="h-[280px] w-full" />}>
                <MovementsChart points={chartQuery.data} />
              </Suspense>
            )}
          </CardContent>
        </Card>

        <Card className="border shadow-none lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Movimentações recentes</CardTitle>
          </CardHeader>
          <CardContent>
            {recentQuery.isPending ? (
              <div className="flex flex-col gap-3">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : recentQuery.isError ? (
              <ErrorState
                {...(recentQuery.error instanceof ApiError && recentQuery.error.code !== undefined
                  ? { code: recentQuery.error.code }
                  : {})}
                onRetry={() => void recentQuery.refetch()}
              />
            ) : recentQuery.data === undefined || recentQuery.data.length === 0 ? (
              <EmptyState
                title="Nenhuma movimentação"
                description="As últimas entradas, saídas e ajustes aparecem aqui, com produto, quantidade e autor."
              />
            ) : (
              <ul className="flex flex-col divide-y">
                {recentQuery.data.map((movement) => (
                  <li key={movement.id} className="flex items-center justify-between gap-3 py-2.5">
                    <div className="flex min-w-0 flex-col gap-0.5">
                      <Link
                        to={`/products/${movement.productId}`}
                        className="truncate text-sm font-medium hover:underline"
                      >
                        {movement.productName}
                      </Link>
                      <span className="text-xs text-muted-foreground">
                        {formatDateTime(movement.createdAt)} · {movement.userName}
                      </span>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <span className="font-mono text-sm">{formatQuantity(movement.quantity)}</span>
                      <MovementTypeBadge type={movement.type} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
