import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from './ConfirmDialog';

/**
 * Testes do `ConfirmDialog`, exigidos pelo roadmap da Fase 3.
 *
 * O caso mais importante é o primeiro: **cancelar não pode executar a ação.**
 * Uma confirmação que executa de qualquer jeito é pior que nenhuma, porque a
 * pessoa confia nela.
 */
function renderDialog(onConfirm = vi.fn()) {
  render(
    <ConfirmDialog
      trigger={<Button>Inativar produto</Button>}
      title="Inativar o produto FER-0001?"
      description="Ele deixa de aparecer para novas movimentações. O histórico é preservado."
      confirmLabel="Inativar"
      destructive
      onConfirm={onConfirm}
    />,
  );

  return { onConfirm };
}

describe('ConfirmDialog', () => {
  it('não mostra o diálogo antes de o gatilho ser acionado', () => {
    renderDialog();

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('abre ao acionar o gatilho', async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.click(screen.getByRole('button', { name: 'Inativar produto' }));

    expect(await screen.findByRole('alertdialog')).toBeInTheDocument();
  });

  it('NÃO executa a ação ao cancelar', async () => {
    const user = userEvent.setup();
    const { onConfirm } = renderDialog();

    await user.click(screen.getByRole('button', { name: 'Inativar produto' }));
    await screen.findByRole('alertdialog');
    await user.click(screen.getByRole('button', { name: 'Cancelar' }));

    expect(onConfirm).not.toHaveBeenCalled();
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('NÃO executa a ação ao fechar com Esc', async () => {
    const user = userEvent.setup();
    const { onConfirm } = renderDialog();

    await user.click(screen.getByRole('button', { name: 'Inativar produto' }));
    await screen.findByRole('alertdialog');
    await user.keyboard('{Escape}');

    expect(onConfirm).not.toHaveBeenCalled();
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('executa a ação exatamente uma vez ao confirmar', async () => {
    const user = userEvent.setup();
    const { onConfirm } = renderDialog();

    await user.click(screen.getByRole('button', { name: 'Inativar produto' }));
    await screen.findByRole('alertdialog');
    await user.click(screen.getByRole('button', { name: 'Inativar' }));

    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it('nomeia o efeito no título, em vez de perguntar "tem certeza"', async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.click(screen.getByRole('button', { name: 'Inativar produto' }));

    const dialogo = await screen.findByRole('alertdialog');
    expect(dialogo).toHaveTextContent('Inativar o produto FER-0001?');
    expect(dialogo).not.toHaveTextContent(/tem certeza/i);
  });

  it('explica a consequência na descrição', async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.click(screen.getByRole('button', { name: 'Inativar produto' }));

    expect(await screen.findByRole('alertdialog')).toHaveTextContent(/histórico é preservado/i);
  });

  it('move o foco para dentro do diálogo ao abrir', async () => {
    const user = userEvent.setup();
    renderDialog();

    const gatilho = screen.getByRole('button', { name: 'Inativar produto' });
    await user.click(gatilho);

    const dialogo = await screen.findByRole('alertdialog');
    expect(dialogo).toContainElement(document.activeElement as HTMLElement);
  });

  it('devolve o foco ao gatilho ao fechar', async () => {
    const user = userEvent.setup();
    renderDialog();

    const gatilho = screen.getByRole('button', { name: 'Inativar produto' });
    await user.click(gatilho);
    await screen.findByRole('alertdialog');
    await user.keyboard('{Escape}');

    // Sem isto, quem navega por teclado volta para o início da página a cada
    // diálogo fechado.
    expect(gatilho).toHaveFocus();
  });

  it('não dispara a ação duas vezes em cliques repetidos', async () => {
    const user = userEvent.setup();
    let resolver: (() => void) | undefined;
    const onConfirm = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolver = resolve;
        }),
    );

    render(
      <ConfirmDialog
        trigger={<Button>Confirmar operação</Button>}
        title="Registrar a saída?"
        description="O saldo do produto será reduzido."
        onConfirm={onConfirm}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Confirmar operação' }));
    await screen.findByRole('alertdialog');

    const confirmar = screen.getByRole('button', { name: 'Confirmar' });
    await user.click(confirmar);

    // Em movimentação de estoque, dois cliques criariam dois lançamentos.
    expect(confirmar).toBeDisabled();
    expect(onConfirm).toHaveBeenCalledOnce();

    resolver?.();
  });
});
