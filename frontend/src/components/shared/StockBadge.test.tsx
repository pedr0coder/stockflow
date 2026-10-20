import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MovementTypeBadge } from './MovementTypeBadge';
import { StockBadge } from './StockBadge';

/**
 * A regra que classifica a situação é testada em `lib/stock-status.test.ts`.
 * Aqui o que importa é a garantia de acessibilidade: **a cor não pode ser o
 * único portador da informação** (docs/06-mvp-e-telas.md §6.6).
 *
 * Por isso os casos verificam o texto, e não a classe de cor: um teste que
 * verificasse a classe passaria mesmo que o rótulo sumisse.
 */
describe('StockBadge', () => {
  it('nomeia as três situações em texto', () => {
    render(
      <>
        <StockBadge status="ok" />
        <StockBadge status="low" />
        <StockBadge status="out" />
      </>,
    );

    expect(screen.getByText('Normal')).toBeInTheDocument();
    expect(screen.getByText('Estoque baixo')).toBeInTheDocument();
    expect(screen.getByText('Sem estoque')).toBeInTheDocument();
  });

  it('a informação sobrevive sem cor', () => {
    const { container } = render(<StockBadge status="out" />);

    // Se o rótulo fosse removido e restasse só a cor, quem não distingue
    // vermelho de cinza, ou quem imprime em preto e branco, perderia o dado.
    expect(container.textContent?.trim()).toBe('Sem estoque');
  });
});

describe('MovementTypeBadge', () => {
  it('nomeia os três tipos em texto', () => {
    render(
      <>
        <MovementTypeBadge type="IN" />
        <MovementTypeBadge type="OUT" />
        <MovementTypeBadge type="ADJUSTMENT" />
      </>,
    );

    expect(screen.getByText('Entrada')).toBeInTheDocument();
    expect(screen.getByText('Saída')).toBeInTheDocument();
    expect(screen.getByText('Ajuste')).toBeInTheDocument();
  });

  it('o ícone é decorativo e não duplica o rótulo no leitor de tela', () => {
    const { container } = render(<MovementTypeBadge type="IN" />);

    const icone = container.querySelector('svg');
    expect(icone).toHaveAttribute('aria-hidden', 'true');
    expect(container.textContent?.trim()).toBe('Entrada');
  });
});
