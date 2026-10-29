import { Pencil, Plus, Shapes } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { DataTable, type DataTableColumn } from '@/components/shared/DataTable';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { PageHeader } from '@/components/shared/PageHeader';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { CategoryFormSheet } from '@/features/categories/components/CategoryFormSheet';
import { useCategoriesQuery, useSetCategoryStatusMutation } from '@/features/categories/queries';
import type { Category } from '@/features/categories/api';
import { useAuth } from '@/features/auth/auth-context';
import { ApiError } from '@/lib/api-client';
import { messageForCode } from '@/lib/error-messages';
import { formatDate } from '@/lib/format';
import { toDataTableErrorState } from '@/lib/query-error';

type StatusFilter = 'active' | 'all' | 'inactive';

const STATUS_FILTER_TO_PARAM: Readonly<Record<StatusFilter, boolean | undefined>> = {
  active: true,
  all: undefined,
  inactive: false,
};

export function CategoriesPage(): ReactNode {
  const { user } = useAuth();
  const canManage = user?.role === 'ADMIN' || user?.role === 'MANAGER';

  const [pageIndex, setPageIndex] = useState(0);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('active');
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<Category | undefined>(undefined);

  const isActiveParam = STATUS_FILTER_TO_PARAM[statusFilter];
  const { data, isPending, isError, error, refetch } = useCategoriesQuery({
    page: pageIndex + 1,
    sort: 'name',
    order: 'asc',
    ...(isActiveParam !== undefined ? { isActive: isActiveParam } : {}),
  });
  const setStatusMutation = useSetCategoryStatusMutation();

  const columns: DataTableColumn<Category>[] = [
    { accessorKey: 'name', header: 'Nome', enableSorting: false },
    {
      accessorKey: 'description',
      header: 'Descrição',
      enableSorting: false,
      cell: ({ row }) => row.original.description ?? '—',
    },
    {
      id: 'status',
      header: 'Situação',
      enableSorting: false,
      cell: ({ row }) =>
        row.original.isActive ? (
          <Badge variant="outline" className="font-normal">
            Ativa
          </Badge>
        ) : (
          <Badge variant="outline" className="border-transparent bg-muted font-normal">
            Inativa
          </Badge>
        ),
    },
    {
      accessorKey: 'createdAt',
      header: 'Criada em',
      enableSorting: false,
      cell: ({ row }) => formatDate(row.original.createdAt),
    },
    ...(canManage
      ? [
          {
            id: 'actions',
            header: 'Ações',
            enableSorting: false,
            cell: ({ row }: { row: { original: Category } }) => {
              const category = row.original;

              return (
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setEditing(category);
                      setSheetOpen(true);
                    }}
                  >
                    <Pencil aria-hidden="true" className="size-4" />
                    <span className="sr-only">Editar {category.name}</span>
                  </Button>

                  <ConfirmDialog
                    trigger={
                      <Button variant="ghost" size="sm">
                        {category.isActive ? 'Inativar' : 'Ativar'}
                      </Button>
                    }
                    title={
                      category.isActive
                        ? `Inativar a categoria ${category.name}?`
                        : `Ativar a categoria ${category.name}?`
                    }
                    description={
                      category.isActive
                        ? 'Categorias com produto ativo vinculado não podem ser inativadas.'
                        : 'A categoria volta a aparecer nas opções de cadastro de produto.'
                    }
                    destructive={category.isActive}
                    onConfirm={async () => {
                      try {
                        await setStatusMutation.mutateAsync({
                          id: category.id,
                          isActive: !category.isActive,
                        });
                      } catch (error) {
                        toast.error(
                          error instanceof ApiError
                            ? messageForCode(error.code, error.message)
                            : 'Não foi possível alterar a situação da categoria.',
                        );
                      }
                    }}
                  />
                </div>
              );
            },
          } satisfies DataTableColumn<Category>,
        ]
      : []),
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Categorias"
        description="Classificação dos produtos do estoque."
        action={
          canManage ? (
            <Button
              onClick={() => {
                setEditing(undefined);
                setSheetOpen(true);
              }}
            >
              <Plus aria-hidden="true" className="size-4" />
              Nova categoria
            </Button>
          ) : undefined
        }
      />

      <div className="flex items-center gap-2">
        <Select
          value={statusFilter}
          onValueChange={(value) => {
            setStatusFilter(value as StatusFilter);
            setPageIndex(0);
          }}
        >
          <SelectTrigger size="sm" className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="active">Ativas</SelectItem>
            <SelectItem value="all">Todas</SelectItem>
            <SelectItem value="inactive">Inativas</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <DataTable
        columns={columns}
        data={data?.data ?? []}
        getRowId={(row) => row.id}
        caption="Lista de categorias"
        empty={{
          title: 'Nenhuma categoria cadastrada',
          description: 'Cadastre a primeira categoria para organizar os produtos.',
          icon: Shapes,
        }}
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

      <CategoryFormSheet open={sheetOpen} onOpenChange={setSheetOpen} category={editing} />
    </div>
  );
}
