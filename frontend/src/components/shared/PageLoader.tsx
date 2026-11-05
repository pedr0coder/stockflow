import type { ReactNode } from 'react';
import { Skeleton } from '@/components/ui/skeleton';

/**
 * Fallback de `Suspense` das rotas carregadas sob demanda (Marco 7C, M7C-1).
 *
 * Renderiza dentro do `Outlet` do `AppShell`, então a sidebar e o cabeçalho
 * permanecem na tela enquanto o chunk da página baixa — só a área de conteúdo
 * mostra o esqueleto. `role="status"` com `aria-live="polite"` anuncia o
 * carregamento a leitores de tela sem interromper o que está sendo lido.
 */
export function PageLoader(): ReactNode {
  return (
    <div role="status" aria-live="polite" className="flex flex-col gap-4">
      <span className="sr-only">Carregando página…</span>
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-4 w-80 max-w-full" />
      <Skeleton className="h-64 w-full" />
    </div>
  );
}
