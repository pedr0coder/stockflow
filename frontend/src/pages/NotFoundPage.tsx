import { Compass } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { Button } from '@/components/ui/button';

/**
 * Rota inexistente.
 *
 * Mesma ideia do contrato de erro da API: uma só forma, mensagem em português e
 * um caminho de volta. Nenhuma informação sobre a estrutura interna do
 * aplicativo é revelada.
 */
export function NotFoundPage(): ReactNode {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 px-4 text-center">
      <div className="rounded-full bg-muted p-3">
        <Compass aria-hidden="true" className="size-6 text-muted-foreground" />
      </div>

      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold">Página não encontrada</h1>
        <p className="max-w-sm text-sm text-muted-foreground">
          O endereço acessado não existe ou foi movido.
        </p>
      </div>

      <Button asChild variant="outline" size="sm">
        <Link to="/dashboard">Ir para o dashboard</Link>
      </Button>
    </div>
  );
}
