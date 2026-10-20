import { AlertCircle, RotateCw } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { messageForCode } from '@/lib/error-messages';
import { cn } from '@/lib/utils';

/**
 * Estado de erro de carregamento.
 *
 * O texto vem de `lib/error-messages.ts`, resolvido pelo `code` do contrato de
 * erro da API. Ver o comentário daquele módulo para o porquê.
 */
export interface ErrorStateProps {
  /** `code` do contrato de erro da API. */
  code?: string | undefined;
  /** Sobrescreve o texto quando a tela conhece um caso específico. */
  message?: string | undefined;
  /** Identificador da requisição, para o usuário citar ao relatar o problema. */
  requestId?: string | undefined;
  onRetry?: (() => void) | undefined;
  className?: string | undefined;
}

export function ErrorState({
  code,
  message,
  requestId,
  onRetry,
  className,
}: ErrorStateProps): ReactNode {
  return (
    <div
      // `role="alert"` faz o leitor de tela anunciar o erro assim que ele
      // aparece, sem a pessoa precisar navegar até aqui.
      role="alert"
      className={cn(
        'flex flex-col items-center justify-center gap-3 px-6 py-12 text-center',
        className,
      )}
    >
      <div className="rounded-full bg-destructive/10 p-3">
        <AlertCircle aria-hidden="true" className="size-6 text-destructive" />
      </div>

      <div className="flex flex-col gap-1">
        <p className="text-base font-medium">Não foi possível carregar</p>
        <p className="max-w-sm text-sm text-muted-foreground">{messageForCode(code, message)}</p>
        {requestId ? (
          // O id liga esta tela à linha de log no servidor. É o que permite
          // investigar sem expor detalhe interno na resposta.
          <p className="mt-1 font-mono text-xs text-muted-foreground">Identificador: {requestId}</p>
        ) : null}
      </div>

      {onRetry ? (
        <Button variant="outline" size="sm" onClick={onRetry} className="mt-2">
          <RotateCw aria-hidden="true" className="size-4" />
          Tentar novamente
        </Button>
      ) : null}
    </div>
  );
}
