import { Play, ShieldCheck, X } from 'lucide-react';
import { Dialog as DialogPrimitive } from 'radix-ui';
import { useState, type ReactNode } from 'react';
import { FormField } from '@/components/shared/FormField';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { validateVisitorName } from '@/features/demo/demo-sandbox';
import { cn } from '@/lib/utils';

export interface DemoEntryModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (visitorName: string) => void;
}

export function DemoEntryModal({ open, onOpenChange, onConfirm }: DemoEntryModalProps): ReactNode {
  const [visitorName, setVisitorName] = useState('');
  const [nameError, setNameError] = useState<string | undefined>(undefined);

  function handleOpenChange(nextOpen: boolean): void {
    if (!nextOpen) {
      setVisitorName('');
      setNameError(undefined);
    }
    onOpenChange(nextOpen);
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    event.stopPropagation();

    const validation = validateVisitorName(visitorName);
    if (!validation.valid) {
      setNameError(validation.error);
      return;
    }

    setNameError(undefined);
    const confirmedName = validation.sanitized;
    setVisitorName('');
    onOpenChange(false);
    onConfirm(confirmedName);
  }

  return (
    <DialogPrimitive.Root open={open} onOpenChange={handleOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          className={cn(
            'fixed inset-0 z-50 bg-black/55 backdrop-blur-[1px]',
            'data-[state=open]:animate-in data-[state=open]:fade-in-0',
            'data-[state=closed]:animate-out data-[state=closed]:fade-out-0',
          )}
        />
        <DialogPrimitive.Content
          className={cn(
            'fixed top-1/2 left-1/2 z-50 grid w-full max-w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 gap-5 rounded-lg border bg-background p-6 shadow-lg duration-200 sm:max-w-md',
            'data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95',
            'data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95',
          )}
        >
          <div className="flex items-start justify-between gap-4">
            <div className="flex flex-col gap-1.5">
              <div className="inline-flex w-fit items-center gap-1.5 rounded-full border border-primary/25 bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
                <ShieldCheck aria-hidden="true" className="size-3.5" />
                Ambiente Sandbox Isolado
              </div>
              <DialogPrimitive.Title className="text-lg font-semibold tracking-tight text-foreground">
                Entrar no modo demonstração
              </DialogPrimitive.Title>
            </div>

            <DialogPrimitive.Close
              type="button"
              aria-label="Fechar modal de demonstração"
              className="rounded-(--radius-md) p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <X aria-hidden="true" className="size-4" />
            </DialogPrimitive.Close>
          </div>

          <DialogPrimitive.Description className="text-sm leading-relaxed text-muted-foreground">
            Você poderá explorar o StockFlow, cadastrar, editar e movimentar itens em uma
            demonstração interativa. Todas as alterações serão temporárias e visíveis apenas para
            você. Nenhum dado original será modificado.
          </DialogPrimitive.Description>

          <form noValidate onSubmit={handleSubmit} className="flex flex-col gap-4">
            <FormField
              label="Como podemos identificar você?"
              error={nameError}
              hint="Informe apenas seu nome ou apelido (2 a 50 caracteres)."
              required
            >
              {(field) => (
                <Input
                  {...field}
                  value={visitorName}
                  onChange={(event) => {
                    setVisitorName(event.target.value);
                    if (nameError !== undefined) {
                      setNameError(undefined);
                    }
                  }}
                  placeholder="Nome"
                  maxLength={50}
                  autoComplete="given-name"
                  autoFocus
                />
              )}
            </FormField>

            <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end">
              <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
                Cancelar
              </Button>
              <Button type="submit" className="gap-2">
                <Play aria-hidden="true" className="size-4" />
                Iniciar demonstração
              </Button>
            </div>
          </form>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
