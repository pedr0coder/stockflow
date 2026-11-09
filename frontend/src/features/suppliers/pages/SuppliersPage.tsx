import { Plus, Truck } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { toast } from 'sonner';
import { DataTable, type DataTableColumn } from '@/components/shared/DataTable';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { PageHeader } from '@/components/shared/PageHeader';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useAuth } from '@/features/auth/auth-context';
import type { Supplier } from '@/features/suppliers/api';
import { useSetSupplierStatusMutation, useSuppliersQuery } from '@/features/suppliers/queries';
import { ApiError } from '@/lib/api-client';
import { messageForCode } from '@/lib/error-messages';
import { toDataTableErrorState } from '@/lib/query-error';
import { useDebouncedValue } from '@/lib/use-debounced-value';

type StatusFilter = 'active' | 'all' | 'inactive';

const STATUS_FILTER_TO_PARAM: Readonly<Record<StatusFilter, boolean | undefined>> = {
  active: true,
  all: undefined,
  inactive: false,
};

export function SuppliersPage(): ReactNode {
  const { user } = useAuth();
  const canManage = user?.role === 'ADMIN' || user?.role === 'MANAGER';

  const [pageIndex, setPageIndex] = useState(0);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('active');
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search);

  const isActiveParam = STATUS_FILTER_TO_PARAM[statusFilter];
  const { data, isPending, isError, error, refetch } = useSuppliersQuery({
    page: pageIndex + 1,
    sort: 'name',
    order: 'asc',
    ...(isActiveParam !== undefined ? { isActive: isActiveParam } : {}),
    ...(debouncedSearch.length > 0 ? { search: debouncedSearch } : {}),
  });
  const setStatusMutation = useSetSupplierStatusMutation();

  function clearFilters(): void {
    setStatusFilter('active');
    setSearch('');
    setPageIndex(0);
  }

  const columns: DataTableColumn<Supplier>[] = [
    {
      accessorKey: 'name',
      header: 'Nome',
      enableSorting: false,
      cell: ({ row }) => (
        <Link to={`/suppliers/${row.original.id}`} className="font-medium hover:underline">
          {row.original.name}
        </Link>
      ),
    },
    {
      accessorKey: 'taxId',
      header: 'CNPJ/CPF',
      enableSorting: false,
      cell: ({ row }) => row.original.taxId ?? '—',
    },
    {
      accessorKey: 'email',
      header: 'E-mail',
      enableSorting: false,
      cell: ({ row }) => row.original.email ?? '—',
    },
    {
      id: 'status',
      header: 'Situação',
      enableSorting: false,
      cell: ({ row }) =>
        row.original.isActive ? (
          <Badge variant="outline" className="font-normal">
            Ativo
          </Badge>
        ) : (
          <Badge variant="outline" className="border-transparent bg-muted font-normal">
            Inativo
          </Badge>
        ),
    },
    ...(canManage
      ? [
          {
            id: 'actions',
            header: 'Ações',
            enableSorting: false,
            cell: ({ row }: { row: { original: Supplier } }) => {
              const supplier = row.original;

              return (
                <ConfirmDialog
                  trigger={
                    <Button variant="ghost" size="sm">
                      {supplier.isActive ? 'Inativar' : 'Ativar'}
                    </Button>
                  }
                  title={
                    supplier.isActive
                      ? `Inativar o fornecedor ${supplier.name}?`
                      : `Ativar o fornecedor ${supplier.name}?`
                  }
                  description={
                    supplier.isActive
                      ? 'Produtos vinculados continuam cadastrados, sem fornecedor associado.'
                      : 'O fornecedor volta a aparecer nas opções de cadastro de produto.'
                  }
                  destructive={supplier.isActive}
                  onConfirm={async () => {
                    try {
                      await setStatusMutation.mutateAsync({
                        id: supplier.id,
                        isActive: !supplier.isActive,
                      });
                    } catch (err) {
                      toast.error(
                        err instanceof ApiError
                          ? messageForCode(err.code, err.message)
                          : 'Não foi possível alterar a situação do fornecedor.',
                      );
                    }
                  }}
                />
              );
            },
          } satisfies DataTableColumn<Supplier>,
        ]
      : []),
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Fornecedores"
        description="Fornecedores vinculados aos produtos."
        action={
          canManage ? (
            <Button asChild>
              <Link to="/suppliers/new">
                <Plus aria-hidden="true" className="size-4" />
                Novo fornecedor
              </Link>
            </Button>
          ) : undefined
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setPageIndex(0);
          }}
          placeholder="Buscar por nome…"
          className="w-full sm:w-64"
          aria-label="Buscar fornecedor"
        />

        <Select
          value={statusFilter}
          onValueChange={(value) => {
            setStatusFilter(value as StatusFilter);
            setPageIndex(0);
          }}
        >
          <SelectTrigger
            size="sm"
            className="w-full sm:w-40"
            aria-label="Filtrar por situação do fornecedor"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="active">Ativos</SelectItem>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="inactive">Inativos</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <DataTable
        columns={columns}
        data={data?.data ?? []}
        getRowId={(row) => row.id}
        caption="Lista de fornecedores"
        empty={{
          title: 'Nenhum fornecedor cadastrado',
          description: 'Cadastre o primeiro fornecedor vinculado aos produtos.',
          icon: Truck,
        }}
        renderCard={(row) => (
          <div className="flex flex-col gap-2">
            <Link to={`/suppliers/${row.id}`} className="flex flex-col gap-1.5">
              <div className="flex items-start justify-between gap-2">
                <span className="font-medium hover:underline">{row.name}</span>
                {row.isActive ? (
                  <Badge variant="outline" className="font-normal">
                    Ativo
                  </Badge>
                ) : (
                  <Badge variant="outline" className="border-transparent bg-muted font-normal">
                    Inativo
                  </Badge>
                )}
              </div>
              <span className="text-xs text-muted-foreground">{row.taxId ?? '—'}</span>
              <span className="break-all text-sm text-muted-foreground">{row.email ?? '—'}</span>
            </Link>

            {canManage ? (
              <div className="flex items-center justify-end gap-2 border-t pt-2">
                <ConfirmDialog
                  trigger={
                    <Button variant="ghost" size="sm">
                      {row.isActive ? 'Inativar' : 'Ativar'}
                    </Button>
                  }
                  title={
                    row.isActive
                      ? `Inativar o fornecedor ${row.name}?`
                      : `Ativar o fornecedor ${row.name}?`
                  }
                  description={
                    row.isActive
                      ? 'Produtos vinculados continuam cadastrados, sem fornecedor associado.'
                      : 'O fornecedor volta a aparecer nas opções de cadastro de produto.'
                  }
                  destructive={row.isActive}
                  onConfirm={async () => {
                    try {
                      await setStatusMutation.mutateAsync({
                        id: row.id,
                        isActive: !row.isActive,
                      });
                    } catch (err) {
                      toast.error(
                        err instanceof ApiError
                          ? messageForCode(err.code, err.message)
                          : 'Não foi possível alterar a situação do fornecedor.',
                      );
                    }
                  }}
                />
              </div>
            ) : null}
          </div>
        )}
        {...(debouncedSearch.length > 0 || statusFilter !== 'active'
          ? { onClearFilters: clearFilters }
          : {})}
        state={
          isPending
            ? { status: 'loading' }
            : isError
              ? toDataTableErrorState(error, () => void refetch())
              : { status: 'ready' }
        }
        server={{
          pageIndex,
          pageCount: data?.meta.totalPages ?? 0,
          onPageChange: setPageIndex,
        }}
      />
    </div>
  );
}
