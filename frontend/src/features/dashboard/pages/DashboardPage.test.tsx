import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/test/render';
import { DashboardPage } from './DashboardPage';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const SUMMARY = { activeProducts: 42, lowStock: 7, outOfStock: 6, movementsLast30Days: 65 };
const CHART = [
  { day: '2026-10-27', type: 'IN', total: 36 },
  { day: '2026-10-27', type: 'OUT', total: 27 },
];
const RECENT = [
  {
    id: 'm1',
    productId: 'p1',
    productName: 'Chave de fenda',
    type: 'OUT',
    reason: 'SALE',
    quantity: '3.000',
    stockAfter: '8.592',
    userName: 'Carla Operadora',
    createdAt: '2026-10-28T00:48:00.000Z',
  },
];

function mockApi(
  overrides: Partial<{ summaryStatus: number; chart: unknown; recent: unknown }> = {},
): void {
  vi.mocked(fetch).mockImplementation((input) => {
    const url = input as string;

    if (url.includes('/dashboard/summary')) {
      return Promise.resolve(jsonResponse(overrides.summaryStatus ?? 200, SUMMARY));
    }
    if (url.includes('/dashboard/movements-chart')) {
      return Promise.resolve(jsonResponse(200, overrides.chart ?? CHART));
    }
    if (url.includes('/dashboard/recent-movements')) {
      return Promise.resolve(jsonResponse(200, overrides.recent ?? RECENT));
    }
    throw new Error(`URL inesperada: ${url}`);
  });
}

describe('DashboardPage', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('mostra os quatro indicadores com valores reais da API', async () => {
    mockApi();

    renderWithProviders(<DashboardPage />);

    expect(await screen.findByText('42')).toBeInTheDocument();
    expect(screen.getByText('65')).toBeInTheDocument();
    expect(screen.getByText('7')).toBeInTheDocument();
    expect(screen.getByText('6')).toBeInTheDocument();
  });

  it('movimentações recentes mostram produto, quantidade e autor reais, com data em pt-BR', async () => {
    mockApi();

    renderWithProviders(<DashboardPage />);

    expect(await screen.findByText('Chave de fenda')).toBeInTheDocument();
    expect(screen.getByText('3,000')).toBeInTheDocument();
    expect(screen.getByText(/carla operadora/i)).toBeInTheDocument();
    // Formato pt-BR (dd/mm/aaaa) — o dia exato depende do fuso local de quem
    // roda o teste, já que a API devolve UTC e a conversão é só na exibição.
    expect(screen.getByText(/\d{2}\/\d{2}\/2026/)).toBeInTheDocument();
  });

  it('sem movimentação no período, mostra o estado vazio do gráfico — não zero inventado', async () => {
    mockApi({ chart: [] });

    renderWithProviders(<DashboardPage />);

    expect(await screen.findByText('Sem movimentações no período')).toBeInTheDocument();
  });

  it('sem movimentação recente, mostra o estado vazio da lista', async () => {
    mockApi({ recent: [] });

    renderWithProviders(<DashboardPage />);

    expect(await screen.findByText('Nenhuma movimentação')).toBeInTheDocument();
  });

  it('erro no resumo mostra estado vazio por indicador, com nova tentativa possível no restante', async () => {
    mockApi({ summaryStatus: 500 });

    renderWithProviders(<DashboardPage />);

    expect(await screen.findAllByText('Não foi possível carregar este indicador.')).toHaveLength(4);
  });

  it('trocar o período reenvia a busca do gráfico com o parâmetro days certo', async () => {
    const user = userEvent.setup();
    mockApi();

    renderWithProviders(<DashboardPage />);
    await screen.findByText('42');

    await user.click(screen.getByRole('combobox'));
    await user.click(await screen.findByRole('option', { name: 'Últimos 7 dias' }));

    await waitFor(() => {
      const chartCall = vi
        .mocked(fetch)
        .mock.calls.map((call) => call[0] as string)
        .find((url) => url.includes('/dashboard/movements-chart') && url.includes('days=7'));
      expect(chartCall).toBeDefined();
    });
  });
});
