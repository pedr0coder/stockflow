import { Boxes, Info, Package, Plus } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { DataTable, type DataTableColumn } from '@/components/shared/DataTable';
import { EmptyState } from '@/components/shared/EmptyState';
import { ErrorState } from '@/components/shared/ErrorState';
import { FormField } from '@/components/shared/FormField';
import { MovementTypeBadge } from '@/components/shared/MovementTypeBadge';
import { PageHeader } from '@/components/shared/PageHeader';
import { StatCard } from '@/components/shared/StatCard';
import { StockBadge } from '@/components/shared/StockBadge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { formatCount, formatDateTime, formatQuantity, formatUnitCost } from '@/lib/format';
import { classifyStock } from '@/lib/stock-status';

/**
 * Vitrine do design system.
 *
 * Existe por dois motivos práticos:
 *
 *   1. torna verificável o critério de aceite da Fase 3 de ter os quatro
 *      estados de carregamento visíveis em uma tela de demonstração;
 *   2. é onde os estados de carregamento e de erro podem ser vistos sem
 *      precisar derrubar o servidor para provocá-los.
 *
 * Sobre os registros da tabela abaixo: eles são **exemplo do componente**, e a
 * própria tela diz isso em texto. Não há aqui nenhum indicador de negócio com
 * número inventado, que é o que a regra do projeto proíbe. Um catálogo de
 * componentes sem conteúdo nenhum não demonstraria coisa alguma.
 */

interface ProdutoExemplo {
  id: string;
  sku: string;
  nome: string;
  saldo: string;
  minimo: string;
  custo: string;
  atualizadoEm: string;
}

const LINHAS_EXEMPLO: readonly ProdutoExemplo[] = [
  {
    id: '1',
    sku: 'FER-0001',
    nome: 'Chave de fenda 1/8" x 4"',
    saldo: '42.000',
    minimo: '10.000',
    custo: '12.9000',
    atualizadoEm: '2026-10-18T13:40:00.000Z',
  },
  {
    id: '2',
    sku: 'FIX-0003',
    nome: 'Porca sextavada M8',
    saldo: '8.000',
    minimo: '600.000',
    custo: '0.3100',
    atualizadoEm: '2026-10-19T09:15:00.000Z',
  },
  {
    id: '3',
    sku: 'EPI-0005',
    nome: 'Capacete de segurança classe B',
    saldo: '0.000',
    minimo: '15.000',
    custo: '38.5000',
    atualizadoEm: '2026-10-19T17:02:00.000Z',
  },
];

const COLUNAS: DataTableColumn<ProdutoExemplo>[] = [
  { accessorKey: 'sku', header: 'SKU', enableSorting: true },
  { accessorKey: 'nome', header: 'Produto', enableSorting: true },
  {
    id: 'situacao',
    header: 'Situação',
    enableSorting: false,
    cell: ({ row }) => (
      <StockBadge status={classifyStock(row.original.saldo, row.original.minimo)} />
    ),
  },
  {
    accessorKey: 'saldo',
    header: 'Saldo',
    enableSorting: true,
    cell: ({ row }) => <span className="font-mono">{formatQuantity(row.original.saldo)}</span>,
  },
  {
    accessorKey: 'custo',
    header: 'Custo unitário',
    enableSorting: true,
    cell: ({ row }) => <span className="font-mono">{formatUnitCost(row.original.custo)}</span>,
  },
  {
    accessorKey: 'atualizadoEm',
    header: 'Atualizado em',
    enableSorting: true,
    cell: ({ row }) => formatDateTime(row.original.atualizadoEm),
  },
];

export function DesignSystemPage(): ReactNode {
  const [confirmado, setConfirmado] = useState(0);

  return (
    <div className="flex flex-col gap-10">
      <PageHeader
        title="Design system"
        description="Catálogo dos componentes compartilhados e dos quatro estados que toda tela de dados precisa tratar."
        breadcrumbs={[{ label: 'Início', to: '/dashboard' }, { label: 'Design system' }]}
        action={
          <Button size="sm">
            <Plus aria-hidden="true" className="size-4" />
            Ação primária
          </Button>
        }
      />

      <p className="flex items-start gap-2 rounded-(--radius-md) border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
        <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
        <span>
          Esta tela demonstra componentes. Os registros exibidos abaixo são exemplos do componente
          de tabela, não dados do sistema. O StockFlow ainda não tem produtos nem movimentações:
          isso é entrega das Fases 4 e 5.
        </span>
      </p>

      <Secao titulo="Os quatro estados" id="estados">
        <p className="text-sm text-muted-foreground">
          Toda tela que carrega dados trata os quatro. Nenhum é opcional, e nenhum é preenchido com
          dado falso.
        </p>

        <div className="grid gap-4 xl:grid-cols-2">
          <Exemplo titulo="Carregando">
            <DataTable
              columns={COLUNAS.slice(0, 3)}
              data={[]}
              getRowId={(row) => row.id}
              caption="Exemplo de tabela carregando"
              state={{ status: 'loading' }}
              empty={{ title: '', description: '' }}
            />
          </Exemplo>

          <Exemplo titulo="Vazio, sem cadastro">
            <DataTable
              columns={COLUNAS.slice(0, 3)}
              data={[]}
              getRowId={(row) => row.id}
              caption="Exemplo de tabela sem registros"
              empty={{
                title: 'Nenhum produto cadastrado',
                description: 'Cadastre o primeiro produto para começar a controlar o estoque.',
                icon: Package,
                action: (
                  <Button size="sm">
                    <Plus aria-hidden="true" className="size-4" />
                    Cadastrar produto
                  </Button>
                ),
              }}
            />
          </Exemplo>

          <Exemplo titulo="Vazio, filtro sem resultado">
            <DataTable
              columns={COLUNAS.slice(0, 3)}
              data={[]}
              getRowId={(row) => row.id}
              caption="Exemplo de filtro sem resultado"
              empty={{ title: '', description: '' }}
              onClearFilters={() => undefined}
            />
          </Exemplo>

          <Exemplo titulo="Erro">
            <DataTable
              columns={COLUNAS.slice(0, 3)}
              data={[]}
              getRowId={(row) => row.id}
              caption="Exemplo de tabela com erro"
              state={{
                status: 'error',
                code: 'INTERNAL_ERROR',
                requestId: '01a148b9-0000-7000-8000-000000000001',
                onRetry: () => undefined,
              }}
              empty={{ title: '', description: '' }}
            />
          </Exemplo>
        </div>
      </Secao>

      <Secao titulo="Tabela com conteúdo" id="tabela">
        <p className="text-sm text-muted-foreground">
          Ordenação por coluna, paginação e, em tela estreita, cada registro vira card. A coluna
          ordenada carrega <code className="font-mono text-xs">aria-sort</code>.
        </p>

        <DataTable
          columns={COLUNAS}
          data={LINHAS_EXEMPLO}
          getRowId={(row) => row.id}
          caption="Exemplo de produtos, para demonstrar o componente de tabela"
          empty={{ title: 'Nenhum produto', description: 'Sem registros.' }}
          renderCard={(row) => (
            <div className="flex flex-col gap-1.5">
              <div className="flex items-start justify-between gap-2">
                <span className="font-medium">{row.nome}</span>
                <StockBadge status={classifyStock(row.saldo, row.minimo)} />
              </div>
              <span className="font-mono text-xs text-muted-foreground">{row.sku}</span>
              <span className="font-mono text-sm">{formatQuantity(row.saldo)}</span>
            </div>
          )}
        />
      </Secao>

      <Secao titulo="Indicadores" id="indicadores">
        <p className="text-sm text-muted-foreground">
          Os três estados do indicador. Repare que <strong>vazio não é zero</strong>: "0 itens" é um
          fato apurado, e "ainda não há como apurar" é outra coisa.
        </p>

        <div className="grid gap-3 sm:grid-cols-3">
          <StatCard label="Carregando" icon={Boxes} state={{ status: 'loading' }} />
          <StatCard
            label="Vazio"
            icon={Boxes}
            state={{ status: 'empty', reason: 'Disponível quando houver movimentação.' }}
          />
          <StatCard
            label="Com valor"
            icon={Boxes}
            state={{ status: 'ready', value: formatCount(1248), hint: 'exemplo do componente' }}
          />
        </div>
      </Secao>

      <Secao titulo="Badges" id="badges">
        <p className="text-sm text-muted-foreground">
          Cor nunca é o único portador da informação: cada badge carrega rótulo em texto, e o de
          movimentação carrega também a direção em ícone.
        </p>

        <div className="flex flex-wrap items-center gap-2">
          <StockBadge status="ok" />
          <StockBadge status="low" />
          <StockBadge status="out" />
          <MovementTypeBadge type="IN" />
          <MovementTypeBadge type="OUT" />
          <MovementTypeBadge type="ADJUSTMENT" />
        </div>
      </Secao>

      <Secao titulo="Formulário" id="formulario">
        <p className="text-sm text-muted-foreground">
          Rótulo, dica e erro associados ao campo por{' '}
          <code className="font-mono text-xs">aria-describedby</code>. O erro aparece junto ao
          campo, nunca apenas em toast.
        </p>

        <div className="grid max-w-md gap-4">
          <FormField label="Nome do produto" hint="Como ele aparece na listagem." required>
            {(field) => <Input {...field} placeholder='Chave de fenda 1/8" x 4"' />}
          </FormField>

          <FormField label="SKU" error="Já existe um produto com este SKU." required>
            {(field) => <Input {...field} defaultValue="FER-0001" />}
          </FormField>
        </div>
      </Secao>

      <Secao titulo="Confirmação de ação" id="confirmacao">
        <p className="text-sm text-muted-foreground">
          O título nomeia o efeito, em vez de perguntar "tem certeza?". Cancelar não executa a ação,{' '}
          <kbd className="font-mono text-xs">Esc</kbd> fecha e o foco volta ao botão que abriu.
        </p>

        <div className="flex items-center gap-3">
          <ConfirmDialog
            trigger={
              <Button variant="outline" size="sm">
                Inativar produto
              </Button>
            }
            title="Inativar o produto FER-0001?"
            description="Ele deixa de aparecer para novas movimentações. O histórico já registrado é preservado, e a inativação pode ser desfeita."
            confirmLabel="Inativar"
            destructive
            onConfirm={() => {
              setConfirmado((value) => value + 1);
            }}
          />

          <span aria-live="polite" className="text-sm text-muted-foreground">
            {confirmado === 0
              ? 'Ação ainda não confirmada.'
              : `Confirmada ${formatCount(confirmado)} vez(es).`}
          </span>
        </div>
      </Secao>

      <Secao titulo="Estados isolados" id="isolados">
        <div className="grid gap-4 xl:grid-cols-2">
          <Exemplo titulo="EmptyState">
            <EmptyState
              title="Nenhum fornecedor cadastrado"
              description="Cadastre fornecedores para vinculá-los aos produtos."
            />
          </Exemplo>

          <Exemplo titulo="ErrorState">
            <ErrorState code="FORBIDDEN" onRetry={() => undefined} />
          </Exemplo>
        </div>
      </Secao>
    </div>
  );
}

function Secao({
  titulo,
  id,
  children,
}: {
  titulo: string;
  id: string;
  children: ReactNode;
}): ReactNode {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-4">
      <h2 id={id} className="text-lg font-semibold tracking-tight">
        {titulo}
      </h2>
      {children}
    </section>
  );
}

function Exemplo({ titulo, children }: { titulo: string; children: ReactNode }): ReactNode {
  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
        {titulo}
      </h3>
      {children}
    </div>
  );
}
