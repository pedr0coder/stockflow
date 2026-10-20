import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { Input } from '@/components/ui/input';
import { FormField } from './FormField';

/**
 * O que estes testes protegem é a **associação acessível** entre rótulo, dica,
 * erro e campo. É o detalhe que quase todo formulário erra, e que não aparece
 * em inspeção visual: a tela parece certa e o leitor de tela anuncia um campo
 * sem nome e sem erro.
 */
describe('FormField', () => {
  it('liga o rótulo ao campo, de modo que clicar no texto foca o campo', async () => {
    const user = userEvent.setup();
    render(<FormField label="SKU">{(field) => <Input {...field} />}</FormField>);

    await user.click(screen.getByText('SKU'));

    expect(screen.getByLabelText('SKU')).toHaveFocus();
  });

  it('expõe o campo pelo nome do rótulo', () => {
    render(<FormField label="Nome do produto">{(field) => <Input {...field} />}</FormField>);

    expect(screen.getByRole('textbox', { name: /nome do produto/i })).toBeInTheDocument();
  });

  it('associa a dica ao campo por aria-describedby', () => {
    render(
      <FormField label="Senha" hint="Mínimo de 10 caracteres.">
        {(field) => <Input {...field} />}
      </FormField>,
    );

    expect(screen.getByRole('textbox', { name: 'Senha' })).toHaveAccessibleDescription(
      'Mínimo de 10 caracteres.',
    );
  });

  it('associa a mensagem de erro ao campo', () => {
    render(
      <FormField label="SKU" error="Já existe um produto com este SKU.">
        {(field) => <Input {...field} />}
      </FormField>,
    );

    // O erro é lido quando a pessoa chega ao campo, e não só se ela navegar
    // até o texto embaixo.
    expect(screen.getByRole('textbox', { name: 'SKU' })).toHaveAccessibleDescription(
      'Já existe um produto com este SKU.',
    );
  });

  it('marca o campo como inválido quando há erro', () => {
    render(
      <FormField label="SKU" error="Campo obrigatório.">
        {(field) => <Input {...field} />}
      </FormField>,
    );

    expect(screen.getByRole('textbox', { name: 'SKU' })).toHaveAttribute('aria-invalid', 'true');
  });

  it('não marca como inválido quando não há erro', () => {
    render(<FormField label="SKU">{(field) => <Input {...field} />}</FormField>);

    expect(screen.getByRole('textbox', { name: 'SKU' })).toHaveAttribute('aria-invalid', 'false');
  });

  it('anuncia o erro assim que ele aparece', () => {
    render(
      <FormField label="SKU" error="Campo obrigatório.">
        {(field) => <Input {...field} />}
      </FormField>,
    );

    expect(screen.getByRole('alert')).toHaveTextContent('Campo obrigatório.');
  });

  it('substitui a dica pelo erro, em vez de empilhar os dois', () => {
    render(
      <FormField label="Senha" hint="Mínimo de 10 caracteres." error="Senha muito curta.">
        {(field) => <Input {...field} />}
      </FormField>,
    );

    expect(screen.getByText('Senha muito curta.')).toBeInTheDocument();
    expect(screen.queryByText('Mínimo de 10 caracteres.')).not.toBeInTheDocument();
  });

  it('indica campo obrigatório também em texto, não só com asterisco', () => {
    render(
      <FormField label="SKU" required>
        {(field) => <Input {...field} />}
      </FormField>,
    );

    // O asterisco é `aria-hidden`: sozinho ele não é anunciado, e quem usa
    // leitor de tela não saberia que o campo é obrigatório.
    expect(screen.getByText('(obrigatório)')).toBeInTheDocument();
  });

  it('gera ids distintos para campos diferentes na mesma tela', () => {
    render(
      <>
        <FormField label="Primeiro">{(field) => <Input {...field} />}</FormField>
        <FormField label="Segundo">{(field) => <Input {...field} />}</FormField>
      </>,
    );

    const primeiro = screen.getByRole('textbox', { name: 'Primeiro' });
    const segundo = screen.getByRole('textbox', { name: 'Segundo' });

    expect(primeiro.id).not.toBe(segundo.id);
  });
});
