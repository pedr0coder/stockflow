import { useMemo, type ReactNode } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { MovementsChartPoint } from '@/features/dashboard/api';
import { formatDate } from '@/lib/format';

export interface MovementsChartProps {
  points: readonly MovementsChartPoint[];
}

interface ChartRow {
  day: string;
  IN: number;
  OUT: number;
  ADJUSTMENT: number;
}

/**
 * Pivota `MovementsChartPoint[]` (uma linha por combinação dia×tipo, como a
 * API devolve) para uma linha por dia com os três tipos como colunas — a
 * forma que o `recharts` precisa para desenhar três barras lado a lado no
 * mesmo dia. A API nunca devolve um dia sem nenhuma movimentação: dias vazios
 * simplesmente não aparecem no array, e aqui também não — o gráfico mostra só
 * os dias com dado real, nunca um dia "zerado" inventado para preencher o
 * eixo.
 */
function pivotByDay(points: readonly MovementsChartPoint[]): ChartRow[] {
  const byDay = new Map<string, ChartRow>();

  for (const point of points) {
    const row = byDay.get(point.day) ?? { day: point.day, IN: 0, OUT: 0, ADJUSTMENT: 0 };
    row[point.type] += point.total;
    byDay.set(point.day, row);
  }

  return Array.from(byDay.values()).sort((a, b) => a.day.localeCompare(b.day));
}

const SERIES: readonly {
  key: keyof Omit<ChartRow, 'day'>;
  label: string;
  color: string;
  border: string;
}[] = [
  { key: 'IN', label: 'Entradas', color: 'var(--color-success)', border: 'oklch(50% 0.145 163)' },
  { key: 'OUT', label: 'Saídas', color: 'var(--color-danger)', border: 'oklch(53% 0.215 27)' },
  {
    key: 'ADJUSTMENT',
    label: 'Ajustes',
    color: 'var(--color-warning)',
    border: 'oklch(52% 0.145 75)',
  },
];

interface TooltipPayloadItem {
  name: string;
  value: number;
  color: string;
  dataKey: string;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: TooltipPayloadItem[];
  label?: string | number;
}

function CustomTooltip({ active, payload, label }: CustomTooltipProps): ReactNode {
  if (!active || !payload || payload.length === 0 || label === undefined) {
    return null;
  }

  const dateStr = String(label);
  const totalDay = payload.reduce((acc, curr) => acc + (Number(curr.value) || 0), 0);

  return (
    <div className="min-w-44 rounded-lg border border-border/80 bg-popover/95 p-3 text-xs shadow-md backdrop-blur-xs">
      <div className="mb-2 flex items-center justify-between gap-3 border-b border-border/60 pb-1.5">
        <span className="font-semibold text-foreground">{formatDate(dateStr)}</span>
        <span className="font-mono text-[11px] font-medium text-muted-foreground">
          {totalDay} {totalDay === 1 ? 'registro' : 'registros'}
        </span>
      </div>
      <div className="flex flex-col gap-1.5">
        {payload.map((entry) => (
          <div key={entry.dataKey} className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-1.5">
              <span
                className="size-2 shrink-0 rounded-full"
                style={{ backgroundColor: entry.color }}
                aria-hidden="true"
              />
              <span className="text-muted-foreground">{entry.name}</span>
            </div>
            <span className="font-mono font-medium text-foreground">
              {entry.value.toLocaleString('pt-BR')}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function MovementsChart({ points }: MovementsChartProps): ReactNode {
  const data = useMemo(() => pivotByDay(points), [points]);

  const totals = useMemo(() => {
    let inCount = 0;
    let outCount = 0;
    let adjCount = 0;
    for (const p of points) {
      if (p.type === 'IN') inCount += p.total;
      else if (p.type === 'OUT') outCount += p.total;
      else if (p.type === 'ADJUSTMENT') adjCount += p.total;
    }
    return { IN: inCount, OUT: outCount, ADJUSTMENT: adjCount };
  }, [points]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-end gap-3 text-xs">
        {SERIES.map((s) => (
          <div
            key={s.key}
            className="inline-flex items-center gap-1.5 rounded-md border border-border/70 bg-surface/50 px-2.5 py-1 text-muted-foreground"
          >
            <span
              className="size-2 shrink-0 rounded-full"
              style={{ backgroundColor: s.color }}
              aria-hidden="true"
            />
            <span className="font-medium text-foreground">{s.label}:</span>
            <span className="font-mono font-semibold text-foreground">
              {totals[s.key].toLocaleString('pt-BR')}
            </span>
          </div>
        ))}
      </div>

      <div className="h-[280px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data}
            margin={{ top: 8, right: 8, bottom: 0, left: -16 }}
            barCategoryGap="20%"
          >
            <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-border/60" />
            <XAxis
              dataKey="day"
              tickFormatter={(value: string) => formatDate(value)}
              className="text-[11px] fill-muted-foreground"
              tickLine={false}
              axisLine={false}
              dy={6}
            />
            <YAxis
              allowDecimals={false}
              className="text-[11px] fill-muted-foreground"
              tickLine={false}
              axisLine={false}
              dx={-4}
            />
            <Tooltip content={<CustomTooltip />} />
            {SERIES.map((series) => (
              <Bar
                key={series.key}
                dataKey={series.key}
                name={series.label}
                fill={series.color}
                maxBarSize={22}
                radius={[4, 4, 0, 0]}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
