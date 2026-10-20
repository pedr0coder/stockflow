import { useState, type ReactNode } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { cn } from '@/lib/utils';

export interface ConfirmDialogProps {
  /** Elemento que abre o diálogo. */
  trigger: ReactNode;
  /**
   * Título que **nomeia o efeito**, não um "Tem certeza?" genérico.
   *
   * "Tem certeza?" obriga a pessoa a reconstruir de memória o que estava
   * prestes a fazer, e é por isso que todo mundo clica em confirmar sem ler.
   * "Inativar o produto PAR-0012?" responde a pergunta sozinho.
   */
  title: string;
  /** O que acontece ao confirmar, e o que não acontece. */
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Visual de ação destrutiva. */
  destructive?: boolean;
  onConfirm: () => void | Promise<void>;
}

/**
 * Confirmação de ação irreversível.
 *
 * Construído sobre o `AlertDialog` do Radix, que já entrega o que um diálogo
 * acessível precisa e que costuma faltar em implementação própria: foco preso
 * dentro do diálogo, foco devolvido ao gatilho ao fechar, `Esc` fechando,
 * `aria-modal` e o resto da página marcado como inerte. É motivo de escolha da
 * biblioteca, não um extra (docs/06-mvp-e-telas.md §6.6).
 */
export function ConfirmDialog({
  trigger,
  title,
  description,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  destructive = false,
  onConfirm,
}: ConfirmDialogProps): ReactNode {
  const [isPending, setIsPending] = useState(false);

  async function handleConfirm(): Promise<void> {
    // Impede duplo envio enquanto a ação está em andamento. Em movimentação de
    // estoque, dois cliques criariam dois lançamentos (§6.4).
    if (isPending) {
      return;
    }

    setIsPending(true);

    try {
      await onConfirm();
    } finally {
      setIsPending(false);
    }
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>{cancelLabel}</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => {
              void handleConfirm();
            }}
            disabled={isPending}
            className={cn(
              destructive && 'bg-destructive text-destructive-foreground hover:bg-destructive/90',
            )}
          >
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
