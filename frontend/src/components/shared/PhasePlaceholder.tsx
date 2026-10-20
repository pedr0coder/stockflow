import { Construction } from 'lucide-react';
import type { ReactNode } from 'react';
import { PageHeader } from './PageHeader';

export interface PhasePlaceholderProps {
  title: string;
  description: string;
  /** Fase do roadmap que entrega esta tela. */
  phase: number;
  /** O que a tela vai fazer, em uma frase. */
  willDeliver: string;
}

/**
 * Tela cuja funcionalidade pertence a uma fase futura.
 *
 * Por que isto existe em vez de simplesmente não ter a rota: o item da sidebar
 * precisa levar a algum lugar, e item de menu que não navega é botão sem
 * função, o que o design system proíbe (docs/06-mvp-e-telas.md §6.4).
 *
 * Por que isto não é um "em breve": "em breve" é promessa vaga de produto, e
 * costuma esconder uma lacuna. Aqui a frase nomeia a fase do roadmap, que está
 * versionada no próprio repositório e pode ser conferida. É um estado de
 * desenvolvimento declarado, com data verificável.
 *
 * **Nenhum dado é exibido.** Não há tabela com linhas falsas, nem indicador com
 * número inventado, nem botão desabilitado sugerindo funcionalidade.
 */
export function PhasePlaceholder({
  title,
  description,
  phase,
  willDeliver,
}: PhasePlaceholderProps): ReactNode {
  return (
    <div className="flex flex-col gap-8">
      <PageHeader title={title} description={description} />

      <div className="flex flex-col items-center justify-center gap-3 rounded-(--radius-lg) border border-dashed px-6 py-16 text-center">
        <div className="rounded-full bg-muted p-3">
          <Construction aria-hidden="true" className="size-6 text-muted-foreground" />
        </div>

        <div className="flex flex-col gap-1">
          <p className="text-base font-medium">Esta tela chega na Fase {phase}</p>
          <p className="max-w-md text-sm text-muted-foreground">{willDeliver}</p>
        </div>

        <p className="mt-2 max-w-md text-xs text-muted-foreground">
          A Fase 3 entrega o design system e a navegação. As funcionalidades de negócio vêm nas
          fases seguintes, na ordem registrada no roadmap do projeto.
        </p>
      </div>
    </div>
  );
}
