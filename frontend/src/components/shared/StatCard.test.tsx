import { render, screen } from '@testing-library/react';
import { Package } from 'lucide-react';
import { describe, expect, it } from 'vitest';
import { StatCard } from './StatCard';

describe('StatCard', () => {
  it('renderiza o estado carregando com texto acessível para leitores de tela', () => {
    render(<StatCard label="Produtos ativos" icon={Package} state={{ status: 'loading' }} />);

    expect(screen.getByText('Produtos ativos')).toBeInTheDocument();
    expect(screen.getByText('Carregando Produtos ativos')).toBeInTheDocument();
  });

  it('renderiza o estado vazio com o motivo informado', () => {
    render(
      <StatCard
        label="Estoque baixo"
        icon={Package}
        state={{ status: 'empty', reason: 'Não foi possível carregar este indicador.' }}
      />,
    );

    expect(screen.getByText('Não foi possível carregar este indicador.')).toBeInTheDocument();
  });

  it('renderiza o estado pronto com valor, hint e tom semântico', () => {
    render(
      <StatCard
        label="Sem estoque"
        icon={Package}
        tone="danger"
        description="Itens com saldo zerado"
        state={{ status: 'ready', value: '12' }}
      />,
    );

    expect(screen.getByText('12')).toBeInTheDocument();
    expect(screen.getByText('Itens com saldo zerado')).toBeInTheDocument();
  });
});
