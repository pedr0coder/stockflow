import { useCallback, useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, Database, Loader2 } from 'lucide-react';

/**
 * Tela de status da Fundação (Fase 2).
 *
 * É deliberadamente mínima. O design system e o shell do app são da Fase 3, e
 * inventar uma interface bonita agora significaria refazê-la. O que esta tela
 * precisa provar é concreto:
 *
 *   1. o frontend compila, sobe e renderiza;
 *   2. ele alcança a API pelo proxy do Vite;
 *   3. ele exibe o **estado real** da requisição, incluindo a falha.
 *
 * Nenhum número é inventado e nenhum estado é simulado: com a API fora do ar,
 * esta tela mostra o erro, e não um painel verde fingindo que está tudo bem.
 * Essa é a regra que vale para o projeto inteiro.
 *
 * O fetch está escrito à mão de propósito. TanStack Query entra na Fase 3, onde
 * há mais de uma consulta para justificar a biblioteca. Uma dependência para um
 * único GET seria dependência sem justificativa.
 */

/** Relativo por padrão, para passar pelo proxy do Vite e evitar CORS em dev. */
const API_URL = import.meta.env.VITE_API_URL || '/api/v1';

interface ReadinessResponse {
  status: 'ok' | 'error';
  database: 'up' | 'down';
}

type RequestState =
  | { kind: 'loading' }
  | { kind: 'success'; data: ReadinessResponse }
  | { kind: 'error'; message: string };

async function fetchReadiness(signal: AbortSignal): Promise<ReadinessResponse> {
  const response = await fetch(`${API_URL}/health/ready`, { signal });
  const body: unknown = await response.json();

  // 503 é resposta esperada do readiness, não falha de rede: o corpo é válido e
  // diz que o banco está fora. Tratar como sucesso da requisição e deixar a UI
  // mostrar o estado real.
  if (!isReadinessResponse(body)) {
    throw new Error(`A API respondeu ${response.status} em um formato inesperado.`);
  }

  return body;
}

function isReadinessResponse(value: unknown): value is ReadinessResponse {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const candidate = value as Partial<ReadinessResponse>;

  return (
    (candidate.status === 'ok' || candidate.status === 'error') &&
    (candidate.database === 'up' || candidate.database === 'down')
  );
}

export function App(): React.JSX.Element {
  const [state, setState] = useState<RequestState>({ kind: 'loading' });
  const [attempt, setAttempt] = useState(0);

  /**
   * O estado de carregamento é o valor INICIAL do useState e, no retry, é
   * definido pelo próprio handler do clique.
   *
   * Nenhum `setState` síncrono no corpo do efeito, de propósito: isso dispara
   * uma renderização em cascata (a regra `react-hooks/set-state-in-effect`
   * aponta exatamente isso) e, nesse caso, seria redundante com o valor inicial.
   */
  useEffect(() => {
    const controller = new AbortController();

    fetchReadiness(controller.signal)
      .then((data) => {
        setState({ kind: 'success', data });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) {
          return;
        }

        setState({
          kind: 'error',
          message:
            error instanceof Error && error.message.length > 0
              ? error.message
              : 'Não foi possível falar com a API.',
        });
      });

    return () => {
      controller.abort();
    };
  }, [attempt]);

  const retry = useCallback(() => {
    setState({ kind: 'loading' });
    setAttempt((value) => value + 1);
  }, []);

  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center gap-6 px-4 py-12">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">StockFlow</h1>
        <p className="text-sm text-(--color-text-muted)">
          Fase 2: fundação. Nenhuma funcionalidade de negócio implementada ainda. Esta tela existe
          para mostrar o estado real da API.
        </p>
      </header>

      <section
        aria-labelledby="status-titulo"
        className="rounded-(--radius-lg) border border-(--color-border) bg-(--color-surface) p-5"
      >
        <h2
          id="status-titulo"
          className="mb-4 flex items-center gap-2 text-sm font-medium text-(--color-text-muted)"
        >
          <Database aria-hidden="true" className="size-4" />
          Status da API
        </h2>

        {/* `role="status"` já implica `aria-live="polite"`: o leitor de tela
            anuncia a mudança de estado sem que o usuário precise navegar de
            volta até aqui. `aria-busy` fica no mesmo elemento da região viva,
            que é onde a tecnologia assistiva procura por ele. */}
        <div role="status" aria-busy={state.kind === 'loading'}>
          {state.kind === 'loading' && (
            <p className="flex items-center gap-2 text-sm">
              <Loader2 aria-hidden="true" className="size-4 animate-spin" />
              Consultando <code className="font-mono text-xs">{API_URL}/health/ready</code>…
            </p>
          )}

          {state.kind === 'success' && (
            <dl className="flex flex-col gap-3 text-sm">
              <div className="flex items-center justify-between gap-4">
                <dt className="text-(--color-text-muted)">Aplicação</dt>
                <dd className="flex items-center gap-1.5 font-medium">
                  {state.data.status === 'ok' ? (
                    <>
                      <CheckCircle2 aria-hidden="true" className="size-4 text-(--color-success)" />
                      pronta
                    </>
                  ) : (
                    <>
                      <AlertCircle aria-hidden="true" className="size-4 text-(--color-danger)" />
                      indisponível
                    </>
                  )}
                </dd>
              </div>

              <div className="flex items-center justify-between gap-4">
                <dt className="text-(--color-text-muted)">PostgreSQL</dt>
                <dd className="flex items-center gap-1.5 font-medium">
                  {state.data.database === 'up' ? (
                    <>
                      <CheckCircle2 aria-hidden="true" className="size-4 text-(--color-success)" />
                      conectado
                    </>
                  ) : (
                    <>
                      <AlertCircle aria-hidden="true" className="size-4 text-(--color-danger)" />
                      fora do ar
                    </>
                  )}
                </dd>
              </div>
            </dl>
          )}

          {state.kind === 'error' && (
            <div className="flex flex-col items-start gap-3">
              <p className="flex items-start gap-2 text-sm">
                <AlertCircle
                  aria-hidden="true"
                  className="mt-0.5 size-4 shrink-0 text-(--color-danger)"
                />
                <span>
                  {state.message}
                  <br />
                  <span className="text-(--color-text-muted)">
                    Verifique se a API está em execução.
                  </span>
                </span>
              </p>

              <button
                type="button"
                onClick={retry}
                className="rounded-(--radius-sm) bg-(--color-primary) px-3 py-1.5 text-sm font-medium text-(--color-primary-fg) transition-opacity hover:opacity-90"
              >
                Tentar novamente
              </button>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
