import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ErrorBoundary } from './ErrorBoundary';

function Quebra(): never {
  throw new Error('falha de renderização de propósito');
}

describe('ErrorBoundary', () => {
  it('renderiza os filhos normalmente quando não há erro', () => {
    render(
      <ErrorBoundary>
        <p>conteúdo normal</p>
      </ErrorBoundary>,
    );

    expect(screen.getByText('conteúdo normal')).toBeInTheDocument();
  });

  it('mostra um estado de erro recuperável em vez de tela branca', () => {
    // O React loga o erro de novo no console durante o teste; isso é
    // esperado e não deve poluir a saída do runner.
    vi.spyOn(console, 'error').mockImplementation(() => {});

    render(
      <ErrorBoundary>
        <Quebra />
      </ErrorBoundary>,
    );

    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText('Algo deu errado nesta tela.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Recarregar' })).toBeInTheDocument();

    vi.restoreAllMocks();
  });
});
