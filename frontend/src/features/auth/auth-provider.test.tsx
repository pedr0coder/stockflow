import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearAccessToken, getAccessToken, setSessionExpiredHandler } from '@/lib/api-client';
import { AuthProvider } from './auth-provider';
import { useAuth } from './auth-context';

/**
 * Testa o `AuthProvider` REAL, com `fetch` mockado — não os módulos
 * internos (`./api`, `lib/api-client`). O comportamento sob teste é a
 * composição dos três, que é o que de fato roda em produção
 * (docs/18-plano-fase-6.md §18.13/§18.16: mock no limite de rede, não da
 * implementação).
 */
function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const USUARIO = { id: 'u1', name: 'Ana Souza', email: 'ana@empresa.com', role: 'OPERATOR' };

/** Consumidor mínimo que expõe o contexto para o teste interagir. */
function Consumer(): React.ReactNode {
  const { user, isLoading, signIn, signOut } = useAuth();

  return (
    <div>
      <p data-testid="loading">{String(isLoading)}</p>
      <p data-testid="user">{user ? user.name : 'sem sessão'}</p>
      <button
        onClick={() => {
          signIn('ana@empresa.com', 'uma-senha-valida').catch(() => undefined);
        }}
      >
        entrar
      </button>
      <button onClick={signOut}>sair</button>
    </div>
  );
}

function renderProvider() {
  return render(
    <AuthProvider>
      <Consumer />
    </AuthProvider>,
  );
}

describe('AuthProvider', () => {
  beforeEach(() => {
    clearAccessToken();
    setSessionExpiredHandler(null);
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
    sessionStorage.clear();
  });

  describe('boot (inicialização do app)', () => {
    it('sem cookie de refresh válido: termina sem sessão, sem erro visível', async () => {
      vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(401, { code: 'UNAUTHORIZED' }));

      renderProvider();

      expect(screen.getByTestId('loading')).toHaveTextContent('true');
      await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('false'));
      expect(screen.getByTestId('user')).toHaveTextContent('sem sessão');
    });

    it('com cookie de refresh válido: restaura a sessão via /auth/refresh + /auth/me', async () => {
      vi.mocked(fetch)
        .mockResolvedValueOnce(
          jsonResponse(200, { accessToken: 'token-restaurado', expiresIn: 900, user: USUARIO }),
        )
        .mockResolvedValueOnce(jsonResponse(200, USUARIO));

      renderProvider();

      await waitFor(() => expect(screen.getByTestId('user')).toHaveTextContent('Ana Souza'));
      expect(getAccessToken()).toBe('token-restaurado');
    });

    it('o access token restaurado nunca é persistido em localStorage nem sessionStorage', async () => {
      vi.mocked(fetch)
        .mockResolvedValueOnce(
          jsonResponse(200, { accessToken: 'token-restaurado', expiresIn: 900, user: USUARIO }),
        )
        .mockResolvedValueOnce(jsonResponse(200, USUARIO));

      renderProvider();
      await waitFor(() => expect(screen.getByTestId('user')).toHaveTextContent('Ana Souza'));

      for (let i = 0; i < localStorage.length; i += 1) {
        const key = localStorage.key(i) ?? '';
        expect(localStorage.getItem(key)).not.toContain('token-restaurado');
      }
      for (let i = 0; i < sessionStorage.length; i += 1) {
        const key = sessionStorage.key(i) ?? '';
        expect(sessionStorage.getItem(key)).not.toContain('token-restaurado');
      }
    });
  });

  describe('signIn', () => {
    it('login válido popula a sessão', async () => {
      vi.mocked(fetch)
        .mockResolvedValueOnce(jsonResponse(401, { code: 'UNAUTHORIZED' })) // boot sem cookie
        .mockResolvedValueOnce(
          jsonResponse(200, { accessToken: 'token-login', expiresIn: 900, user: USUARIO }),
        );

      const user = userEvent.setup();
      renderProvider();
      await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('false'));

      await user.click(screen.getByRole('button', { name: 'entrar' }));

      await waitFor(() => expect(screen.getByTestId('user')).toHaveTextContent('Ana Souza'));
      expect(getAccessToken()).toBe('token-login');
    });

    it('login inválido (401) não popula sessão nenhuma', async () => {
      vi.mocked(fetch)
        .mockResolvedValueOnce(jsonResponse(401, { code: 'UNAUTHORIZED' })) // boot
        .mockResolvedValueOnce(jsonResponse(401, { code: 'INVALID_CREDENTIALS' })); // login

      const user = userEvent.setup();
      renderProvider();
      await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('false'));

      await user.click(screen.getByRole('button', { name: 'entrar' }));

      // A promessa rejeita (consumida aqui como void, sem throw não tratado
      // no teste); o estado continua sem sessão.
      await waitFor(() => expect(screen.getByTestId('user')).toHaveTextContent('sem sessão'));
      expect(getAccessToken()).toBeNull();
    });
  });

  describe('signOut', () => {
    it('encerra a sessão local mesmo que POST /auth/logout falhe (rede fora do ar)', async () => {
      vi.mocked(fetch)
        .mockResolvedValueOnce(
          jsonResponse(200, { accessToken: 'token-x', expiresIn: 900, user: USUARIO }),
        )
        .mockResolvedValueOnce(jsonResponse(200, USUARIO))
        .mockRejectedValueOnce(new TypeError('Failed to fetch')); // POST /auth/logout

      const user = userEvent.setup();
      renderProvider();
      await waitFor(() => expect(screen.getByTestId('user')).toHaveTextContent('Ana Souza'));

      await user.click(screen.getByRole('button', { name: 'sair' }));

      // Síncrono: a sessão local encerra incondicionalmente, sem esperar a
      // chamada de rede ao servidor (docs/18-plano-fase-6.md §18.5).
      expect(screen.getByTestId('user')).toHaveTextContent('sem sessão');
      expect(getAccessToken()).toBeNull();
    });

    it('logout durante o boot em andamento: a resposta tardia do boot NÃO restaura a sessão', async () => {
      let resolveRefresh: (value: Response) => void = () => undefined;
      vi.mocked(fetch).mockImplementationOnce(
        () =>
          new Promise<Response>((resolve) => {
            resolveRefresh = resolve;
          }),
      );

      renderProvider();
      // O boot ainda está em voo (a promessa de refresh não resolveu).
      expect(screen.getByTestId('loading')).toHaveTextContent('true');

      // `signOut` chamado AGORA, antes de o boot terminar.
      await userEvent.setup().click(screen.getByRole('button', { name: 'sair' }));
      expect(screen.getByTestId('user')).toHaveTextContent('sem sessão');

      // Só DEPOIS o boot recebe sua resposta (tardia, de sucesso).
      resolveRefresh(
        jsonResponse(200, { accessToken: 'token-tardio', expiresIn: 900, user: USUARIO }),
      );

      // Mesmo que o `me()` subsequente também resolvesse com sucesso, a
      // geração já mudou: o resultado é descartado. Não há próxima chamada
      // de `me()` porque o teste não a forneceu — se o provider tentasse
      // chamá-la mesmo assim, o mock undefined rejeitaria, e o `catch` do
      // boot ainda respeita a guarda de geração.
      await waitFor(() => expect(screen.getByTestId('user')).toHaveTextContent('sem sessão'));
      expect(getAccessToken()).toBeNull();
    });
  });
});
