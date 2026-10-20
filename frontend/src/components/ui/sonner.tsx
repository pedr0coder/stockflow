import {
  CircleCheckIcon,
  InfoIcon,
  Loader2Icon,
  OctagonXIcon,
  TriangleAlertIcon,
} from 'lucide-react';
import { Toaster as Sonner, type ToasterProps } from 'sonner';

/**
 * Toaster do projeto.
 *
 * O componente que o CLI do shadcn gera usa `next-themes` para ler o tema
 * atual. Este projeto não usa Next.js, e o dark mode só é avaliado na Fase 7
 * (docs/06-mvp-e-telas.md §6.1), então a dependência foi removida e o tema fica
 * fixo em claro. Quando o dark mode entrar, este é o ponto que passa a ler a
 * preferência, e ele vira a única mudança necessária aqui.
 */
export function Toaster(props: ToasterProps) {
  return (
    <Sonner
      theme="light"
      className="toaster group"
      icons={{
        success: <CircleCheckIcon className="size-4" />,
        info: <InfoIcon className="size-4" />,
        warning: <TriangleAlertIcon className="size-4" />,
        error: <OctagonXIcon className="size-4" />,
        loading: <Loader2Icon className="size-4 animate-spin" />,
      }}
      style={
        {
          '--normal-bg': 'var(--color-popover)',
          '--normal-text': 'var(--color-popover-foreground)',
          '--normal-border': 'var(--color-border)',
          '--border-radius': 'var(--radius-md)',
        } as React.CSSProperties
      }
      {...props}
    />
  );
}
