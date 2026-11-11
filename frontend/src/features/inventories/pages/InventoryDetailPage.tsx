import { useState, type ReactNode } from 'react';
import { useParams } from 'react-router';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { DataTable, type DataTableColumn } from '@/components/shared/DataTable';
import { ErrorState } from '@/components/shared/ErrorState';
import { PageHeader } from '@/components/shared/PageHeader';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/features/auth/auth-context';
import { InventoryCountCell } from '@/features/inventories/components/InventoryCountCell';
import { InventoryProductCell } from '@/features/inventories/components/InventoryProductCell';
import { STATUS_LABEL, type InventoryItem } from '@/features/inventories/api';
import {
  useApproveInventoryMutation,
  useCancelInventoryMutation,
  useInventoryQuery,
  useSubmitInventoryMutation,
} from '@/features/inventories/queries';
import { ApiError } from '@/lib/api-client';
import { messageForCode } from '@/lib/error-messages';
import { formatDateTime, formatQuantity } from '@/lib/format';

export function InventoryDetailPage(): ReactNode {
  const { id } = useParams<{ id: string }>();
  const inventoryId = id ?? '';
  const { user } = useAuth();
  const canManage = user?.role === 'ADMIN' || user?.role === 'MANAGER';

  const [approveError, setApproveError] = useState<string | null>(null);

  const { data: inventory, isPending, isError, error, refetch } = useInventoryQuery(inventoryId);
  const submitMutation = useSubmitInventoryMutation(inventoryId);
  const approveMutation = useApproveInventoryMutation(inventoryId);
  const cancelMutation = useCancelInventoryMutation(inventoryId);

  if (isPending) {
    return (
      <div className="flex flex-col gap-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (isError || inventory === undefined) {
    return (
      <ErrorState
        {...(error instanceof ApiError && error.code !== undefined ? { code: error.code } : {})}
        onRetry={() => void refetch()}
      />
    );
  }

  const canCount = inventory.status === 'OPEN' || inventory.status === 'COUNTING';
  const canSubmit = canCount;
  const canApprove = canManage && inventory.status === 'PENDING_APPROVAL';
  const canCancel =
    canManage &&
    (inventory.status === 'OPEN' ||
      inventory.status === 'COUNTING' ||
      inventory.status === 'PENDING_APPROVAL');

  const items = inventory.items ?? [];
  const countedCount = items.filter((item) => item.countedQty !== null).length;
  const itemsWithMovement = items.filter(
    (item) => item.movedSinceCount !== null && item.movedSinceCount !== '0.000',
  );

  const columns: DataTableColumn<InventoryItem>[] = [
    {
      id: 'product',
      header: 'Produto',
      enableSorting: false,
      cell: ({ row }) => (
        <InventoryProductCell
          productId={row.original.productId}
          productSku={row.original.productSku}
          productName={row.original.productName}
        />
      ),
    },
    {
      id: 'expected',
      header: 'Esperado',
      enableSorting: false,
      cell: ({ row }) => (
        <span className="font-mono">
          {row.original.expectedQty !== null ? formatQuantity(row.original.expectedQty) : '—'}
        </span>
      ),
    },
    {
      id: 'counted',
      header: 'Contado',
      enableSorting: false,
      cell: ({ row }) => (
        <InventoryCountCell inventoryId={inventoryId} item={row.original} canCount={canCount} />
      ),
    },
    {
      id: 'divergence',
      header: 'Divergência',
      enableSorting: false,
      cell: ({ row }) => {
        const { divergence } = row.original;

        if (divergence === null) {
          return <span className="text-muted-foreground">—</span>;
        }

        const isZero = Number.parseFloat(divergence) === 0;

        return (
          <span className={isZero ? 'font-mono' : 'font-mono text-(--color-warning)'}>
            {formatQuantity(divergence)}
          </span>
        );
      },
    },
    {
      id: 'movedSinceCount',
      header: 'Desde a contagem',
      enableSorting: false,
      cell: ({ row }) => {
        const { movedSinceCount } = row.original;

        if (movedSinceCount === null) {
          return <span className="text-muted-foreground">—</span>;
        }

        const hasMoved = Number.parseFloat(movedSinceCount) !== 0;

        if (!hasMoved) {
          return <span className="font-mono text-muted-foreground">0,000</span>;
        }

        return (
          <Badge
            variant="outline"
            className="gap-1 border-(--color-warning)/25 bg-(--color-warning)/10 font-mono font-normal text-(--color-warning)"
            title="O saldo já mudou desde que este item foi contado — revise antes de aprovar."
          >
            {formatQuantity(movedSinceCount)}
          </Badge>
        );
      },
    },
    {
      id: 'countedBy',
      header: 'Contado por',
      enableSorting: false,
      cell: ({ row }) =>
        row.original.countedBy !== null ? (
          <div className="flex flex-col text-xs">
            <span>{row.original.countedBy.name}</span>
            <span className="text-muted-foreground">
              {row.original.countedAt !== null ? formatDateTime(row.original.countedAt) : null}
            </span>
          </div>
        ) : (
          <span className="text-muted-foreground">Não contado</span>
        ),
    },
  ];

  async function handleApprove(): Promise<void> {
    setApproveError(null);

    try {
      const result = await approveMutation.mutateAsync();
      toast.success(`Inventário aprovado. ${result.adjustedItemsCount} item(ns) ajustado(s).`);
    } catch (error) {
      if (error instanceof ApiError && error.code === 'INSUFFICIENT_STOCK') {
        const details = error.details as
          { problems?: { productId: string; available: string; requested: string }[] } | undefined;
        const problems = details?.problems ?? [];
        setApproveError(
          problems.length > 0
            ? `Saldo insuficiente em ${problems.length} produto(s) — a aprovação foi recusada inteira, nenhum ajuste foi aplicado. Revise a contagem desses itens e tente novamente.`
            : messageForCode(error.code, error.message),
        );
      } else {
        setApproveError(
          error instanceof ApiError
            ? messageForCode(error.code, error.message)
            : 'Não foi possível aprovar o inventário. Tente novamente.',
        );
      }
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={inventory.code}
        breadcrumbs={[{ label: 'Inventários', to: '/inventories' }, { label: inventory.code }]}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">{STATUS_LABEL[inventory.status]}</Badge>

            {canSubmit ? (
              <ConfirmDialog
                trigger={<Button variant="outline">Enviar para aprovação</Button>}
                title="Enviar este inventário para aprovação?"
                description="Encerra a contagem: não será possível registrar novas contagens depois disso."
                onConfirm={async () => {
                  try {
                    await submitMutation.mutateAsync();
                    toast.success('Inventário enviado para aprovação.');
                  } catch (err) {
                    toast.error(
                      err instanceof ApiError
                        ? messageForCode(err.code, err.message)
                        : 'Não foi possível enviar para aprovação.',
                    );
                  }
                }}
              />
            ) : null}

            {canApprove ? (
              <ConfirmDialog
                trigger={<Button>Aprovar</Button>}
                title={`Aprovar o inventário ${inventory.code}?`}
                description={
                  itemsWithMovement.length > 0
                    ? `${itemsWithMovement.length} item(ns) tiveram o saldo alterado desde a contagem (coluna "Desde a contagem") — revise-os antes de confirmar. O ajuste final é calculado pelo servidor no momento da aprovação, não pela contagem registrada aqui.`
                    : 'O saldo de cada produto contado é ajustado para o valor contado, calculado e aplicado pelo servidor numa única transação.'
                }
                onConfirm={handleApprove}
              />
            ) : null}

            {canCancel ? (
              <ConfirmDialog
                trigger={<Button variant="outline">Cancelar</Button>}
                title={`Cancelar o inventário ${inventory.code}?`}
                description="O histórico de contagem é preservado, mas a contagem não pode ser retomada depois de cancelado."
                destructive
                onConfirm={async () => {
                  try {
                    await cancelMutation.mutateAsync();
                    toast.success('Inventário cancelado.');
                  } catch (err) {
                    toast.error(
                      err instanceof ApiError
                        ? messageForCode(err.code, err.message)
                        : 'Não foi possível cancelar o inventário.',
                    );
                  }
                }}
              />
            ) : null}
          </div>
        }
      />

      {approveError !== null ? (
        <p
          role="alert"
          className="rounded-(--radius-md) border border-(--color-danger)/30 bg-(--color-danger)/10 px-3 py-2 text-sm text-(--color-danger)"
        >
          {approveError}
        </p>
      ) : null}

      <Card className="border shadow-none">
        <CardContent className="grid grid-cols-2 gap-4 pt-6 sm:grid-cols-4">
          <div>
            <p className="text-xs text-muted-foreground">Itens</p>
            <p className="font-mono text-lg">{items.length}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Contados</p>
            <p className="font-mono text-lg">
              {countedCount}/{items.length}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Iniciado em</p>
            <p>{formatDateTime(inventory.startedAt)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Aberto por</p>
            <p>{inventory.createdBy?.name ?? '—'}</p>
          </div>
        </CardContent>
      </Card>

      <Card className="border shadow-none">
        <CardHeader>
          <CardTitle className="text-base">Itens do inventário</CardTitle>
        </CardHeader>
        <CardContent>
          <DataTable
            columns={columns}
            data={items}
            getRowId={(row) => row.id}
            caption={`Itens do inventário ${inventory.code}`}
            empty={{
              title: 'Nenhum item',
              description: 'Este inventário não tem produtos selecionados.',
            }}
            pageSize={50}
          />
        </CardContent>
      </Card>
    </div>
  );
}
