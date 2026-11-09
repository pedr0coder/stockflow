import type { SortingState } from '@tanstack/react-table';
import { Plus, Users as UsersIcon } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { DataTable, type DataTableColumn } from '@/components/shared/DataTable';
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
import { useAuth } from '@/features/auth/auth-context';
import type { User } from '@/features/users/api';
import { useUsersQuery } from '@/features/users/queries';
import { toDataTableErrorState } from '@/lib/query-error';
import { formatDateTime } from '@/lib/format';
import { ROLE_LABEL, USER_ROLES, type UserRole } from '@/types/auth';

const ALL = 'all';
type StatusFilter = 'active' | 'all' | 'inactive';

export function UsersPage(): ReactNode {
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';

  const [pageIndex, setPageIndex] = useState(0);
  const [sorting, setSorting] = useState<SortingState>([{ id: 'name', desc: false }]);
  const [roleFilter, setRoleFilter] = useState<UserRole | typeof ALL>(ALL);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('active');

  const activeSort = sorting[0];
  const { data, isPending, isError, error, refetch } = useUsersQuery({
    page: pageIndex + 1,
    sort: activeSort?.id ?? 'name',
    order: activeSort?.desc ? 'desc' : 'asc',
    ...(roleFilter !== ALL ? { role: roleFilter } : {}),
    ...(statusFilter !== 'all' ? { isActive: statusFilter === 'active' } : {}),
  });

  const hasFilters = roleFilter !== ALL || statusFilter !== 'active';

  function clearFilters(): void {
    setRoleFilter(ALL);
    setStatusFilter('active');
    setPageIndex(0);
  }

  const columns: DataTableColumn<User>[] = [
    {
      accessorKey: 'name',
      header: 'Nome',
      enableSorting: true,
      cell: ({ row }) => (
        <Link to={`/users/${row.original.id}`} className="font-medium hover:underline">
          {row.original.name}
        </Link>
      ),
    },
    { accessorKey: 'email', header: 'E-mail', enableSorting: true },
    {
      id: 'role',
      header: 'Papel',
      enableSorting: false,
      cell: ({ row }) => <Badge variant="outline">{ROLE_LABEL[row.original.role]}</Badge>,
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
    {
      id: 'lastLoginAt',
      header: 'Último acesso',
      enableSorting: false,
      cell: ({ row }) =>
        row.original.lastLoginAt !== null ? formatDateTime(row.original.lastLoginAt) : 'Nunca',
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Usuários"
        description="Contas de acesso e seus papéis."
        action={
          isAdmin ? (
            <Button asChild>
              <Link to="/users/new">
                <Plus aria-hidden="true" className="size-4" />
                Novo usuário
              </Link>
            </Button>
          ) : undefined
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <Select
          value={roleFilter}
          onValueChange={(value) => {
            setRoleFilter(value as UserRole | typeof ALL);
            setPageIndex(0);
          }}
        >
          <SelectTrigger size="sm" className="w-full sm:w-40" aria-label="Filtrar por papel">
            <SelectValue placeholder="Papel" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Qualquer papel</SelectItem>
            {USER_ROLES.map((role) => (
              <SelectItem key={role} value={role}>
                {ROLE_LABEL[role]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={statusFilter}
          onValueChange={(value) => {
            setStatusFilter(value as StatusFilter);
            setPageIndex(0);
          }}
        >
          <SelectTrigger
            size="sm"
            className="w-full sm:w-36"
            aria-label="Filtrar por situação do usuário"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="active">Ativos</SelectItem>
            <SelectItem value={ALL}>Todos</SelectItem>
            <SelectItem value="inactive">Inativos</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <DataTable
        columns={columns}
        data={data?.data ?? []}
        getRowId={(row) => row.id}
        caption="Lista de usuários"
        empty={{
          title: 'Nenhum usuário cadastrado',
          description: 'Cadastre a primeira conta de acesso.',
          icon: UsersIcon,
        }}
        renderCard={(row) => (
          <Link to={`/users/${row.id}`} className="flex flex-col gap-1.5">
            <div className="flex items-start justify-between gap-2">
              <span className="font-medium hover:underline">{row.name}</span>
              <div className="flex shrink-0 items-center gap-1.5">
                <Badge variant="outline">{ROLE_LABEL[row.role]}</Badge>
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
            </div>
            <span className="break-all text-sm text-muted-foreground">{row.email}</span>
            <span className="text-xs text-muted-foreground">
              Último acesso: {row.lastLoginAt !== null ? formatDateTime(row.lastLoginAt) : 'Nunca'}
            </span>
          </Link>
        )}
        {...(hasFilters ? { onClearFilters: clearFilters } : {})}
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
          sorting,
          onSortingChange: (next) => {
            setSorting(next);
            setPageIndex(0);
          },
        }}
      />
    </div>
  );
}
