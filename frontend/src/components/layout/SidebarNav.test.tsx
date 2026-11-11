import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithRouter } from '@/test/render';
import { SidebarNav } from './SidebarNav';

/**
 * A matriz de navegação por papel, conforme o mapa de telas (§6.2) e a tabela
 * de permissões da API (docs/05-api.md).
 *
 * Leia o último caso deste arquivo antes de concluir qualquer coisa sobre
 * segurança a partir daqui.
 */

function nomesDosItens(): string[] {
  const nav = screen.getByRole('navigation', { name: /navegação principal/i });
  return within(nav)
    .getAllByRole('link')
    .map((link) => link.textContent?.replace('(página atual)', '').trim() ?? '');
}

describe('SidebarNav', () => {
  it('mostra tudo para o administrador', () => {
    renderWithRouter(<SidebarNav role="ADMIN" labels="visible" />);

    expect(nomesDosItens()).toEqual([
      'Dashboard',
      'Produtos',
      'Categorias',
      'Fornecedores',
      'Movimentações',
      'Inventários',
      'Relatórios',
      'Usuários',
      'Auditoria',
    ]);
  });

  it('esconde a auditoria do gerente, mas mantém usuários', () => {
    renderWithRouter(<SidebarNav role="MANAGER" labels="visible" />);

    const itens = nomesDosItens();
    expect(itens).toContain('Usuários');
    expect(itens).not.toContain('Auditoria');
  });

  it('esconde a administração inteira do operador', () => {
    renderWithRouter(<SidebarNav role="OPERATOR" labels="visible" />);

    const itens = nomesDosItens();
    expect(itens).not.toContain('Usuários');
    expect(itens).not.toContain('Auditoria');
  });

  it('mantém as telas de operação para o operador', () => {
    renderWithRouter(<SidebarNav role="OPERATOR" labels="visible" />);

    const itens = nomesDosItens();
    expect(itens).toContain('Produtos');
    expect(itens).toContain('Movimentações');
    expect(itens).toContain('Inventários');
  });

  it('descarta o grupo que ficou sem nenhum item', () => {
    renderWithRouter(<SidebarNav role="OPERATOR" labels="visible" />);

    // "Administração" só tem itens de ADMIN e MANAGER: para o operador o grupo
    // inteiro some, em vez de sobrar um título solto.
    expect(screen.queryByRole('heading', { name: /administração/i })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /cadastros/i })).toBeInTheDocument();
  });

  it('marca a rota atual para tecnologia assistiva', () => {
    renderWithRouter(<SidebarNav role="ADMIN" labels="visible" />, { route: '/products' });

    const atual = screen.getByRole('link', { name: /produtos/i });
    expect(atual).toHaveTextContent('(página atual)');
  });

  it('mantém o rótulo no DOM mesmo no modo ícone', () => {
    renderWithRouter(<SidebarNav role="ADMIN" labels="hidden" />);

    // No modo ícone o rótulo fica `sr-only`, não removido: o leitor de tela
    // continua anunciando o nome do item.
    expect(screen.getByRole('link', { name: /produtos/i })).toBeInTheDocument();
  });

  it('a filtragem por papel é conveniência de interface, não autorização', () => {
    // ┌────────────────────────────────────────────────────────────────────┐
    // │ Este caso existe como documentação executável.                     │
    // │                                                                    │
    // │ Ele prova que o item some da navegação, e NADA ALÉM DISSO. Não     │
    // │ prova, e não pode provar, que um OPERATOR está impedido de acessar │
    // │ a rota ou o recurso: basta digitar a URL, ou chamar a API direto.  │
    // │                                                                    │
    // │ A autorização de verdade é verificada no servidor, por guard, e é  │
    // │ testada por requisição real com token de cada papel na Fase 4      │
    // │ (docs/07-testes.md §7.4, docs/08-seguranca.md §8.3).               │
    // └────────────────────────────────────────────────────────────────────┘
    renderWithRouter(<SidebarNav role="OPERATOR" labels="visible" />);

    expect(screen.queryByRole('link', { name: /auditoria/i })).not.toBeInTheDocument();

    // A rota continua existindo e continua alcançável por URL. Isto não é um
    // defeito desta camada: é o motivo de a proteção morar no servidor.
    renderWithRouter(<SidebarNav role="ADMIN" labels="visible" />);
    expect(screen.getAllByRole('link', { name: /auditoria/i })[0]).toHaveAttribute(
      'href',
      '/audit',
    );
  });
});
