import { useMemo, type ReactNode } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
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

const SERIES: readonly { key: keyof Omit<ChartRow, 'day'>; label: string; color: string }[] = [
  { key: 'IN', label: 'Entrada', color: 'var(--color-success)' },
  { key: 'OUT', label: 'Saída', color: 'var(--color-danger)' },
  { key: 'ADJUSTMENT', label: 'Ajuste', color: 'var(--color-warning)' },
];

export function MovementsChart({ points }: MovementsChartProps): ReactNode {
  const data = useMemo(() => pivotByDay(points), [points]);

  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-border" />
        <XAxis
          dataKey="day"
          tickFormatter={(value: string) => formatDate(value)}
          className="text-xs fill-muted-foreground"
          tickLine={false}
          axisLine={false}
        />
        <YAxis
          allowDecimals={false}
          className="text-xs fill-muted-foreground"
          tickLine={false}
          axisLine={false}
          width={32}
        />
        <Tooltip
          labelFormatter={(value: ReactNode) =>
            typeof value === 'string' ? formatDate(value) : value
          }
          contentStyle={{
            backgroundColor: 'var(--color-popover)',
            color: 'var(--color-popover-foreground)',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-md)',
          }}
        />
        <Legend
          formatter={(value: string) => SERIES.find((s) => s.label === value)?.label ?? value}
        />
        {SERIES.map((series) => (
          <Bar
            key={series.key}
            dataKey={series.key}
            name={series.label}
            fill={series.color}
            radius={[2, 2, 0, 0]}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}
