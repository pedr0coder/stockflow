import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';

/**
 * Testes por comportamento observável, não por implementação.
 *
 * Nenhuma assertiva olha estado interno ou nome de componente: tudo é feito
 * pelo que a pessoa vê e pelo papel acessível do elemento. É o que permite
 * reescrever a tela na Fase 3 sem reescrever o teste.
 *
 * O ponto central aqui é o estado de **erro**: a regra do projeto é que a UI
 * nunca esconda falha atrás de dado falso, e isso precisa de teste, não de
 * promessa.
 */
describe('App — tela de status da fundação', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function respondWith(body: unknown, status = 200): void {
    fetchMock.mockResolvedValue({
      status,
      json: () => Promise.resolve(body),
    });
  }

  it('mostra o estado de carregamento antes da resposta', () => {
    // Promise que nunca resolve: congela a tela no estado de loading.
    fetchMock.mockReturnValue(new Promise(() => {}));

    render(<App />);

    expect(screen.getByText(/consultando/i)).toBeInTheDocument();
    // A região viva anuncia o estado para leitor de tela e marca que está
    // ocupada enquanto a requisição não volta.
    expect(screen.getByRole('status')).toHaveAttribute('aria-busy', 'true');
  });

  it('mostra aplicação pronta e banco conectado quando a API responde ok', async () => {
    respondWith({ status: 'ok', database: 'up' });

    render(<App />);

    expect(await screen.findByText('pronta')).toBeInTheDocument();
    expect(screen.getByText('conectado')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveAttribute('aria-busy', 'false');
  });

  it('chama o endpoint de readiness', async () => {
    respondWith({ status: 'ok', database: 'up' });

    render(<App />);
    await screen.findByText('pronta');

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/health/ready'),
      expect.anything(),
    );
  });

  it('mostra o banco fora do ar quando a API responde 503, sem fingir sucesso', async () => {
    respondWith({ status: 'error', database: 'down' }, 503);

    render(<App />);

    // 503 é resposta válida do readiness: a requisição funcionou e o conteúdo
    // precisa dizer a verdade sobre o estado do banco.
    expect(await screen.findByText('indisponível')).toBeInTheDocument();
    expect(screen.getByText('fora do ar')).toBeInTheDocument();
    expect(screen.queryByText('conectado')).not.toBeInTheDocument();
  });

  it('mostra erro quando a rede falha, e não um estado otimista', async () => {
    fetchMock.mockRejectedValue(new Error('Failed to fetch'));

    render(<App />);

    expect(await screen.findByText(/failed to fetch/i)).toBeInTheDocument();
    expect(screen.getByText(/verifique se a api está em execução/i)).toBeInTheDocument();
    expect(screen.queryByText('pronta')).not.toBeInTheDocument();
  });

  it('mostra erro quando a resposta vem em formato inesperado', async () => {
    respondWith({ qualquer: 'coisa' });

    render(<App />);

    expect(await screen.findByText(/formato inesperado/i)).toBeInTheDocument();
  });

  it('refaz a requisição ao clicar em "Tentar novamente"', async () => {
    const user = userEvent.setup();
    fetchMock.mockRejectedValueOnce(new Error('Failed to fetch'));

    render(<App />);
    await screen.findByRole('button', { name: /tentar novamente/i });

    // A segunda tentativa encontra a API de pé.
    respondWith({ status: 'ok', database: 'up' });
    await user.click(screen.getByRole('button', { name: /tentar novamente/i }));

    expect(await screen.findByText('pronta')).toBeInTheDocument();
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });
  });

  it('declara explicitamente que não há funcionalidade de negócio ainda', () => {
    fetchMock.mockReturnValue(new Promise(() => {}));

    render(<App />);

    // A tela não pode sugerir que o sistema faz mais do que faz.
    expect(screen.getByText(/nenhuma funcionalidade de negócio/i)).toBeInTheDocument();
  });
});
