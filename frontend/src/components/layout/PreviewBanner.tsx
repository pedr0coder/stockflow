import { TriangleAlert } from 'lucide-react';
import type { ReactNode } from 'react';

/**
 * Faixa de pré-visualização de interface.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ ESTE COMPONENTE SERÁ DELETADO NA FASE 6, junto com `ui-preview-auth`.    │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Por que uma faixa fixa e não fechável:
 *
 * A Fase 3 entrega o shell do aplicativo antes de existir autenticação e antes
 * de existir dado. Alguém que abra o sistema agora vê uma interface completa,
 * com sidebar, cabeçalho e telas, e poderia concluir que está diante de um
 * produto funcionando.
 *
 * A faixa torna impossível chegar a essa conclusão por engano. Ela não fecha
 * porque o aviso não é uma notificação: é uma condição do que está na tela, e
 * vale enquanto a condição existir.
 *
 * `role="status"` em vez de `role="alert"`: não é uma emergência a ser
 * interrompida, é um estado a ser anunciado.
 */
export function PreviewBanner(): ReactNode {
  return (
    <div
      role="status"
      className="flex items-center justify-center gap-2 bg-(--color-warning)/15 px-4 py-2 text-center text-xs text-(--color-warning)"
    >
      <TriangleAlert aria-hidden="true" className="size-3.5 shrink-0" />
      <p>
        <strong className="font-semibold">Pré-visualização de interface.</strong> Não há
        autenticação nem dados reais: esta sessão existe apenas para navegar pelo design system da
        Fase 3.
      </p>
    </div>
  );
}
