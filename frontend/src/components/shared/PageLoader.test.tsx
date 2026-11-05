import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PageLoader } from './PageLoader';

describe('PageLoader', () => {
  it('anuncia o carregamento como região de status educada, sem interromper o leitor de tela', () => {
    render(<PageLoader />);

    const status = screen.getByRole('status');
    expect(status).toHaveAttribute('aria-live', 'polite');
    expect(status).toHaveTextContent('Carregando página…');
  });
});
