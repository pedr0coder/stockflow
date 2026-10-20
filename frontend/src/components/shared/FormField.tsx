import { useId, type ReactNode } from 'react';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

export interface FormFieldProps {
  label: string;
  /** Recebe os ids a aplicar no controle. */
  children: (field: {
    id: string;
    'aria-describedby': string | undefined;
    'aria-invalid': boolean;
  }) => ReactNode;
  /**
   * Texto de apoio, exibido quando não há erro.
   *
   * O `| undefined` explícito é exigido por `exactOptionalPropertyTypes`: sem
   * ele, quem passa `error={errors.campo?.message}` precisaria montar o objeto
   * de props condicionalmente só para não passar `undefined`. Aqui "ausente" e
   * "undefined" significam a mesma coisa de propósito.
   */
  hint?: string | undefined;
  /** Mensagem de erro, normalmente vinda do Zod. */
  error?: string | undefined;
  required?: boolean | undefined;
  className?: string | undefined;
}

/**
 * Campo de formulário com rótulo, dica e erro associados.
 *
 * O ponto deste componente é a **associação acessível**, que é o detalhe que
 * quase todo formulário erra:
 *
 *   - `htmlFor` liga o rótulo ao controle, então clicar no texto foca o campo e
 *     o leitor de tela anuncia o nome junto com o valor;
 *   - `aria-describedby` liga a dica **e** o erro ao controle, então o erro é
 *     lido no momento em que a pessoa chega ao campo, e não só quando ela
 *     navega até o texto vermelho embaixo;
 *   - `aria-invalid` marca o estado, que é o que tecnologia assistiva usa para
 *     dizer "inválido" sem depender da cor da borda.
 *
 * Erro de formulário aparece **sempre junto ao campo**, nunca apenas em toast
 * (docs/06-mvp-e-telas.md §6.4): um toast some sozinho e a pessoa fica sem
 * saber qual campo corrigir.
 *
 * O `children` é função porque os ids são gerados aqui e precisam chegar ao
 * controle. Passar os ids por fora abriria espaço para divergirem.
 */
export function FormField({
  label,
  children,
  hint,
  error,
  required = false,
  className,
}: FormFieldProps): ReactNode {
  const fieldId = useId();
  const hintId = `${fieldId}-hint`;
  const errorId = `${fieldId}-error`;

  const hasError = error !== undefined && error.length > 0;
  const showHint = hint !== undefined && hint.length > 0 && !hasError;

  const describedBy = [showHint ? hintId : null, hasError ? errorId : null]
    .filter((value): value is string => value !== null)
    .join(' ');

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <Label htmlFor={fieldId} className={cn(hasError && 'text-destructive')}>
        {label}
        {required ? (
          <>
            <span aria-hidden="true" className="text-destructive">
              *
            </span>
            <span className="sr-only">(obrigatório)</span>
          </>
        ) : null}
      </Label>

      {children({
        id: fieldId,
        'aria-describedby': describedBy.length > 0 ? describedBy : undefined,
        'aria-invalid': hasError,
      })}

      {showHint ? (
        <p id={hintId} className="text-xs text-muted-foreground">
          {hint}
        </p>
      ) : null}

      {hasError ? (
        // `role="alert"` anuncia a mensagem assim que ela aparece, sem esperar
        // a pessoa navegar até aqui.
        <p id={errorId} role="alert" className="text-xs font-medium text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
