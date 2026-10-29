import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { DataTable, type DataTableColumn } from './DataTable';

/**
 * Testes do `DataTable`, exigidos pelo roadmap da Fase 3.
 *
 * Escritos por comportamento observável: tudo passa pelo papel acessível do
 * elemento e pelo texto que a pessoa vê. Nenhuma assertiva olha estado interno
 * da biblioteca de tabela, para que trocar a implementação não quebre o teste.
 */

interface Produto {
  id: string;
  sku: string;
  nome: string;
  saldo: string;
}

const COLUNAS: DataTableColumn<Produto>[] = [
  { accessorKey: 'sku', header: 'SKU', enableSorting: true },
  { accessorKey: 'nome', header: 'Produto', enableSorting: true },
  { accessorKey: 'saldo', header: 'Saldo', enableSorting: false },
];

const DADOS: Produto[] = [
  { id: '1', sku: 'C-003', nome: 'Carrinho', saldo: '5.000' },
  { id: '2', sku: 'A-001', nome: 'Alicate', saldo: '12.000' },
  { id: '3', sku: 'B-002', nome: 'Broca', saldo: '0.000' },
];

function renderTable(props: Partial<Parameters<typeof DataTable<Produto>>[0]> = {}) {
  return render(
    <DataTable
      columns={COLUNAS}
      data={DADOS}
      getRowId={(row) => row.id}
      caption="Lista de produtos"
      empty={{ title: 'Nenhum produto', description: 'Cadastre o primeiro produto.' }}
      {...props}
    />,
  );
}

describe('DataTable', () => {
  describe('estado de carregamento', () => {
    it('mostra skeleton em vez de tabela vazia', () => {
      renderTable({ state: { status: 'loading' }, data: [] });

      expect(screen.getByRole('table')).toHaveAccessibleName(/carregando lista de produtos/i);
      expect(screen.getByText(/carregando lista de produtos/i)).toBeInTheDocument();
    });

    it('marca a região como ocupada para tecnologia assistiva', () => {
      const { container } = renderTable({ state: { status: 'loading' }, data: [] });

      expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();
    });

    it('não mostra o estado vazio enquanto carrega', () => {
      renderTable({ state: { status: 'loading' }, data: [] });

      expect(screen.queryByText('Nenhum produto')).not.toBeInTheDocument();
    });
  });

  describe('estado vazio', () => {
    it('mostra ausência de cadastro quando não há filtro', () => {
      renderTable({ data: [] });

      expect(screen.getByText('Nenhum produto')).toBeInTheDocument();
      expect(screen.getByText('Cadastre o primeiro produto.')).toBeInTheDocument();
    });

    it('mostra filtro sem resultado, com ação de limpar, quando há filtro', () => {
      const limpar = vi.fn();
      renderTable({ data: [], onClearFilters: limpar });

      // A distinção importa: quem acabou de filtrar precisa de "limpar
      // filtros", não de "cadastrar o primeiro produto".
      expect(screen.getByText(/nenhum resultado para este filtro/i)).toBeInTheDocument();
      expect(screen.queryByText('Nenhum produto')).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: /limpar filtros/i })).toBeInTheDocument();
    });

    it('executa a limpeza de filtros ao clicar', async () => {
      const user = userEvent.setup();
      const limpar = vi.fn();
      renderTable({ data: [], onClearFilters: limpar });

      await user.click(screen.getByRole('button', { name: /limpar filtros/i }));

      expect(limpar).toHaveBeenCalledOnce();
    });
  });

  describe('estado de erro', () => {
    it('mostra a mensagem correspondente ao código, e não o código', () => {
      renderTable({ data: [], state: { status: 'error', code: 'FORBIDDEN' } });

      expect(screen.getByRole('alert')).toHaveTextContent(/não tem permissão/i);
      expect(screen.queryByText('FORBIDDEN')).not.toBeInTheDocument();
    });

    it('exibe o identificador da requisição, para o usuário relatar o erro', () => {
      renderTable({
        data: [],
        state: { status: 'error', code: 'INTERNAL_ERROR', requestId: '01a1-48b9' },
      });

      expect(screen.getByText(/01a1-48b9/)).toBeInTheDocument();
    });

    it('refaz a consulta ao clicar em tentar novamente', async () => {
      const user = userEvent.setup();
      const tentar = vi.fn();
      renderTable({ data: [], state: { status: 'error', onRetry: tentar } });

      await user.click(screen.getByRole('button', { name: /tentar novamente/i }));

      expect(tentar).toHaveBeenCalledOnce();
    });

    it('não mostra a tabela quando há erro', () => {
      renderTable({ state: { status: 'error', code: 'INTERNAL_ERROR' } });

      expect(screen.queryByRole('table')).not.toBeInTheDocument();
    });
  });

  describe('conteúdo', () => {
    it('renderiza uma linha por registro', () => {
      renderTable();

      // +1 pela linha de cabeçalho.
      expect(screen.getAllByRole('row')).toHaveLength(DADOS.length + 1);
    });

    it('descreve a tabela para leitor de tela', () => {
      renderTable();

      expect(screen.getByRole('table')).toHaveAccessibleName('Lista de produtos');
    });

    it('associa cada cabeçalho à sua coluna', () => {
      renderTable();

      for (const header of screen.getAllByRole('columnheader')) {
        expect(header).toHaveAttribute('scope', 'col');
      }
    });
  });

  describe('ordenação', () => {
    it('não marca ordenação antes de qualquer clique', () => {
      renderTable();

      const sku = screen.getByRole('columnheader', { name: /sku/i });
      expect(sku).toHaveAttribute('aria-sort', 'none');
    });

    it('ordena de forma crescente no primeiro clique e marca aria-sort', async () => {
      const user = userEvent.setup();
      renderTable();

      await user.click(screen.getByRole('button', { name: /sku/i }));

      expect(screen.getByRole('columnheader', { name: /sku/i })).toHaveAttribute(
        'aria-sort',
        'ascending',
      );

      const linhas = screen.getAllByRole('row').slice(1);
      expect(within(linhas[0] as HTMLElement).getByText('A-001')).toBeInTheDocument();
    });

    it('inverte a ordem no segundo clique', async () => {
      const user = userEvent.setup();
      renderTable();

      await user.click(screen.getByRole('button', { name: /sku/i }));
      await user.click(screen.getByRole('button', { name: /sku/i }));

      expect(screen.getByRole('columnheader', { name: /sku/i })).toHaveAttribute(
        'aria-sort',
        'descending',
      );

      const linhas = screen.getAllByRole('row').slice(1);
      expect(within(linhas[0] as HTMLElement).getByText('C-003')).toBeInTheDocument();
    });

    it('não oferece ordenação em coluna que não a declara', () => {
      renderTable();

      const saldo = screen.getByRole('columnheader', { name: /saldo/i });
      expect(within(saldo).queryByRole('button')).not.toBeInTheDocument();
    });

    it('o controle de ordenação é botão, então funciona por teclado', async () => {
      const user = userEvent.setup();
      renderTable();

      const botao = screen.getByRole('button', { name: /sku/i });
      botao.focus();
      await user.keyboard('{Enter}');

      expect(screen.getByRole('columnheader', { name: /sku/i })).toHaveAttribute(
        'aria-sort',
        'ascending',
      );
    });
  });

  describe('paginação', () => {
    const muitos: Produto[] = Array.from({ length: 25 }, (_, index) => ({
      id: String(index),
      sku: `SKU-${String(index).padStart(3, '0')}`,
      nome: `Produto ${String(index)}`,
      saldo: '1.000',
    }));

    it('não aparece quando tudo cabe em uma página', () => {
      renderTable();

      expect(screen.queryByRole('navigation', { name: /pagina/i })).not.toBeInTheDocument();
    });

    it('divide os registros e informa a página atual', () => {
      renderTable({ data: muitos, pageSize: 10 });

      expect(screen.getByRole('navigation', { name: /paginação/i })).toBeInTheDocument();
      expect(screen.getByText(/página 1 de 3/i)).toBeInTheDocument();
      expect(screen.getAllByRole('row')).toHaveLength(11);
    });

    it('desabilita o botão anterior na primeira página', () => {
      renderTable({ data: muitos, pageSize: 10 });

      expect(screen.getByRole('button', { name: /anterior/i })).toBeDisabled();
      expect(screen.getByRole('button', { name: /próxima/i })).toBeEnabled();
    });

    it('avança e volta de página', async () => {
      const user = userEvent.setup();
      renderTable({ data: muitos, pageSize: 10 });

      await user.click(screen.getByRole('button', { name: /próxima/i }));
      expect(screen.getByText(/página 2 de 3/i)).toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: /anterior/i }));
      expect(screen.getByText(/página 1 de 3/i)).toBeInTheDocument();
    });

    it('desabilita o botão próxima na última página', async () => {
      const user = userEvent.setup();
      renderTable({ data: muitos, pageSize: 10 });

      await user.click(screen.getByRole('button', { name: /próxima/i }));
      await user.click(screen.getByRole('button', { name: /próxima/i }));

      expect(screen.getByText(/página 3 de 3/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /próxima/i })).toBeDisabled();
    });
  });

  describe('tela estreita', () => {
    it('renderiza os registros também como lista de cards', () => {
      renderTable({
        renderCard: (row) => <span>{`card ${row.sku}`}</span>,
      });

      // A tabela e a lista coexistem no DOM; qual aparece é decidido por CSS.
      // O que o teste garante é que nenhum registro se perde no caminho.
      expect(screen.getByRole('list')).toBeInTheDocument();
      expect(screen.getAllByRole('listitem')).toHaveLength(DADOS.length);
      expect(screen.getByText('card A-001')).toBeInTheDocument();
    });
  });

  describe('paginação e ordenação controladas pelo servidor (Marco 6B)', () => {
    it('usa pageCount do servidor, não data.length, para decidir quantas páginas existem', () => {
      // Uma única página de 3 linhas, mas o servidor diz que há 5 páginas no
      // total — se a tabela calculasse pelo tamanho do array, mostraria 1.
      renderTable({ server: { pageIndex: 0, pageCount: 5, onPageChange: vi.fn() } });

      expect(screen.getByText(/página 1 de 5/i)).toBeInTheDocument();
    });

    it('clicar em "próxima" chama onPageChange em vez de paginar o array local', async () => {
      const onPageChange = vi.fn();
      const user = userEvent.setup();
      renderTable({ server: { pageIndex: 0, pageCount: 5, onPageChange } });

      await user.click(screen.getByRole('button', { name: /próxima/i }));

      expect(onPageChange).toHaveBeenCalledWith(1);
      // A página exibida não avança sozinha: quem decide é o pai, ao refazer a
      // busca com o novo pageIndex e passar novos dados/pageIndex de volta.
      expect(screen.getByText(/página 1 de 5/i)).toBeInTheDocument();
    });

    it('reflete o pageIndex que o pai controla, não um estado interno', () => {
      renderTable({ server: { pageIndex: 2, pageCount: 5, onPageChange: vi.fn() } });

      expect(screen.getByText(/página 3 de 5/i)).toBeInTheDocument();
    });

    it('clicar em ordenar chama onSortingChange em vez de ordenar o array local', async () => {
      const onSortingChange = vi.fn();
      const user = userEvent.setup();
      renderTable({
        server: { pageIndex: 0, pageCount: 1, onPageChange: vi.fn(), sorting: [], onSortingChange },
      });

      await user.click(screen.getByRole('button', { name: /produto/i }));

      expect(onSortingChange).toHaveBeenCalledWith([{ id: 'nome', desc: false }]);
      // A ordem visual das linhas não muda sozinha: a lista vem de `data`,
      // que só o pai re-busca ordenada do servidor.
      const rows = screen.getAllByRole('row').slice(1);
      expect(within(rows[0]!).getByText('Carrinho')).toBeInTheDocument();
    });
  });
});
