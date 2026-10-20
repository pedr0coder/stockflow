import { Boxes } from 'lucide-react';
import type { ReactNode } from 'react';
import { Outlet } from 'react-router';

/**
 * Layout das telas públicas, hoje apenas o login.
 *
 * Coluna única e centrada, sem sidebar e sem cabeçalho: quem ainda não entrou
 * não tem para onde navegar, e oferecer navegação seria oferecer caminhos que
 * terminam em redirecionamento de volta para cá.
 */
export function AuthLayout(): ReactNode {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-8 bg-muted/40 px-4 py-12">
      <div className="flex items-center gap-2 text-lg font-semibold">
        <Boxes aria-hidden="true" className="size-6 text-primary" />
        StockFlow
      </div>

      <main className="w-full max-w-sm">
        <Outlet />
      </main>

      <p className="max-w-sm text-center text-xs text-muted-foreground">
        Gerenciamento de estoque com histórico imutável de movimentações.
      </p>
    </div>
  );
}
