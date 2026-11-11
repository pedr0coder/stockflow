import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MovementsChart } from './MovementsChart';
import type { MovementsChartPoint } from '@/features/dashboard/api';

const MOCK_POINTS: MovementsChartPoint[] = [
  { day: '2026-10-27', type: 'IN', total: 15 },
  { day: '2026-10-27', type: 'OUT', total: 5 },
  { day: '2026-10-28', type: 'IN', total: 10 },
  { day: '2026-10-28', type: 'ADJUSTMENT', total: 2 },
];

describe('MovementsChart', () => {
  it('renderiza os totais do período nas legendas executivas com dados reais', () => {
    render(<MovementsChart points={MOCK_POINTS} />);

    // Total IN: 15 + 10 = 25
    expect(screen.getByText('Entradas:')).toBeInTheDocument();
    expect(screen.getByText('25')).toBeInTheDocument();

    // Total OUT: 5
    expect(screen.getByText('Saídas:')).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument();

    // Total ADJUSTMENT: 2
    expect(screen.getByText('Ajustes:')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
  });
});
