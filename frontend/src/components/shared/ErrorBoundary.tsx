import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';

/**
 * Rede de segurança de topo (Marco 7A, A5).
 *
 * `ErrorState` cobre erro de **query** (falha de rede, 4xx/5xx da API) — é a
 * maioria dos casos, e cada tela já trata isso. O que faltava era um erro de
 * **renderização** (um `undefined.algo`, um dado em formato inesperado que
 * escapa da validação): sem este componente, ele derrubava a árvore inteira
 * do React e deixava a tela em branco, sem nenhuma pista para a pessoa.
 *
 * Só existe um, no topo (`main.tsx`), de propósito: um boundary por tela
 * teria custo de manutenção maior do que o problema real justifica para este
 * projeto, e o objetivo aqui é parar de mostrar tela branca, não isolar cada
 * widget.
 */
interface ErrorBoundaryState {
  error: Error | undefined;
}

export class ErrorBoundary extends Component<{ children: ReactNode }, ErrorBoundaryState> {
  override state: ErrorBoundaryState = { error: undefined };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    // console.error, e não um serviço de monitoramento: nenhum está configurado
    // neste MVP (docs/19-plano-fase-7.md). O objetivo aqui é não perder o
    // erro, não reportá-lo a um terceiro.
    // eslint-disable-next-line no-console
    console.error('Erro não tratado na árvore de componentes.', error, info.componentStack);
  }

  private readonly handleReload = (): void => {
    window.location.reload();
  };

  override render(): ReactNode {
    if (this.state.error !== undefined) {
      return (
        <div
          role="alert"
          className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center"
        >
          <p className="text-base font-medium">Algo deu errado nesta tela.</p>
          <p className="max-w-sm text-sm text-muted-foreground">
            O erro foi registrado. Recarregar a página costuma resolver.
          </p>
          <Button variant="outline" size="sm" onClick={this.handleReload}>
            Recarregar
          </Button>
        </div>
      );
    }

    return this.props.children;
  }
}
