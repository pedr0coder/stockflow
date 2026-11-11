import {
  AlertTriangle,
  ArrowDownLeft,
  ArrowRight,
  ArrowRightLeft,
  ArrowUpRight,
  Boxes,
  FileText,
  Package,
  PackageX,
  Scale,
} from 'lucide-react';
import { lazy, Suspense, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { EmptyState } from '@/components/shared/EmptyState';
import { ErrorState } from '@/components/shared/ErrorState';
import { MovementTypeBadge } from '@/components/shared/MovementTypeBadge';
import { PageHeader } from '@/components/shared/PageHeader';
import { StatCard, type StatCardState } from '@/components/shared/StatCard';
import { Button } from '@/components/ui/button';
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
import { REASON_LABEL, type MovementReasonValue } from '@/features/stock-movements/api';
import { ApiError } from '@/lib/api-client';
import { formatDateTime, formatQuantity } from '@/lib/format';
import { cn } from '@/lib/utils';

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
        description="Visão geral do estoque: fluxo operacional, catálogo e alertas de reposição."
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" asChild>
              <Link to="/reports">
                <FileText className="size-4" aria-hidden="true" />
                Relatórios
              </Link>
            </Button>
            <Button size="sm" asChild>
              <Link to="/movements/new">
                <ArrowRightLeft className="size-4" aria-hidden="true" />
                Nova movimentação
              </Link>
            </Button>
          </div>
        }
      />

      <section aria-labelledby="indicadores" className="flex flex-col gap-3">
        <h2 id="indicadores" className="sr-only">
          Indicadores
        </h2>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label="Produtos ativos"
            icon={Package}
            description="Itens ativos no catálogo"
            state={statState(
              summaryQuery.data?.activeProducts,
              summaryQuery.isPending,
              summaryQuery.isError,
            )}
          />
          <StatCard
            label="Movimentações (30 dias)"
            icon={Boxes}
            description="Entradas, saídas e ajustes"
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
            description="Abaixo do ponto de reposição"
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
            description="Itens com saldo zerado"
            state={statState(
              summaryQuery.data?.outOfStock,
              summaryQuery.isPending,
              summaryQuery.isError,
            )}
          />
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-5">
        <Card className="min-w-0 border bg-card shadow-xs lg:col-span-3">
          <CardHeader className="flex flex-col items-start justify-between gap-3 border-b border-border/50 pb-4 sm:flex-row sm:items-center">
            <div className="flex flex-col gap-1">
              <CardTitle className="text-base font-semibold">Fluxo de movimentações</CardTitle>
              <p className="text-xs text-muted-foreground">
                Evolução diária de entradas, saídas e ajustes
              </p>
            </div>
            <Select
              value={String(days)}
              onValueChange={(value) => {
                setDays(Number(value));
              }}
            >
              <SelectTrigger size="sm" className="w-full sm:w-44" aria-label="Período do gráfico">
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
          <CardContent className="pt-5">
            {chartQuery.isPending ? (
              <Skeleton className="h-[320px] w-full rounded-lg" />
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
              <Suspense fallback={<Skeleton className="h-[320px] w-full rounded-lg" />}>
                <MovementsChart points={chartQuery.data} />
              </Suspense>
            )}
          </CardContent>
        </Card>

        <Card className="min-w-0 border bg-card shadow-xs lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between gap-2 border-b border-border/50 pb-4">
            <div className="flex flex-col gap-1">
              <CardTitle className="text-base font-semibold">Movimentações recentes</CardTitle>
              <p className="text-xs text-muted-foreground">Últimos registros operacionais</p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              asChild
              className="h-8 text-xs text-muted-foreground hover:text-foreground"
            >
              <Link to="/movements">
                Ver todas
                <ArrowRight className="size-3.5" aria-hidden="true" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent className="pt-4">
            {recentQuery.isPending ? (
              <div className="flex flex-col gap-3">
                <Skeleton className="h-12 w-full rounded-lg" />
                <Skeleton className="h-12 w-full rounded-lg" />
                <Skeleton className="h-12 w-full rounded-lg" />
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
              <ul className="flex flex-col divide-y divide-border/40">
                {recentQuery.data.map((movement) => (
                  <li
                    key={movement.id}
                    className="flex items-center justify-between gap-3 py-3 transition-colors first:pt-0 last:pb-0"
                  >
                    <div className="flex min-w-0 items-center gap-2.5">
                      <div
                        className={cn(
                          'flex size-8 shrink-0 items-center justify-center rounded-md border',
                          movement.type === 'IN' &&
                            'border-emerald-500/20 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
                          movement.type === 'OUT' &&
                            'border-rose-500/20 bg-rose-500/10 text-rose-600 dark:text-rose-400',
                          movement.type === 'ADJUSTMENT' &&
                            'border-amber-500/20 bg-amber-500/10 text-amber-600 dark:text-amber-400',
                        )}
                        title={
                          movement.type === 'IN'
                            ? 'Entrada'
                            : movement.type === 'OUT'
                              ? 'Saída'
                              : 'Ajuste'
                        }
                      >
                        {movement.type === 'IN' ? (
                          <ArrowDownLeft className="size-4" aria-hidden="true" />
                        ) : movement.type === 'OUT' ? (
                          <ArrowUpRight className="size-4" aria-hidden="true" />
                        ) : (
                          <Scale className="size-4" aria-hidden="true" />
                        )}
                      </div>

                      <div className="flex min-w-0 flex-col gap-0.5">
                        <div className="flex items-center gap-1.5">
                          <Link
                            to={`/products/${movement.productId}`}
                            className="truncate text-sm font-semibold text-foreground hover:underline"
                          >
                            {movement.productName}
                          </Link>
                          {movement.productSku ? (
                            <span className="hidden font-mono text-[11px] text-muted-foreground sm:inline">
                              {movement.productSku}
                            </span>
                          ) : null}
                        </div>
                        <span className="truncate text-xs text-muted-foreground">
                          {REASON_LABEL[movement.reason as MovementReasonValue] ?? movement.reason}{' '}
                          · {formatDateTime(movement.createdAt)} · {movement.userName}
                        </span>
                      </div>
                    </div>

                    <div className="flex shrink-0 flex-col items-end gap-0.5">
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono text-sm font-semibold text-foreground">
                          {formatQuantity(movement.quantity)}
                        </span>
                        <MovementTypeBadge type={movement.type} />
                      </div>
                      <span className="font-mono text-[11px] text-muted-foreground">
                        Saldo: {formatQuantity(movement.stockAfter)}
                      </span>
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
