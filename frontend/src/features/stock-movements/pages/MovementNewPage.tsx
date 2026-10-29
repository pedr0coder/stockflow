import type { ReactNode } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { PageHeader } from '@/components/shared/PageHeader';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuth } from '@/features/auth/auth-context';
import { AdjustmentForm } from '@/features/stock-movements/components/AdjustmentForm';
import { MovementEntryForm } from '@/features/stock-movements/components/MovementEntryForm';

export function MovementNewPage(): ReactNode {
  const { user } = useAuth();
  const canAdjust = user?.role === 'ADMIN' || user?.role === 'MANAGER';

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Nova movimentação"
        breadcrumbs={[{ label: 'Movimentações', to: '/movements' }, { label: 'Nova movimentação' }]}
      />

      <Card className="max-w-xl border shadow-none">
        <CardContent className="pt-6">
          <Tabs defaultValue="in">
            <TabsList>
              <TabsTrigger value="in">Entrada</TabsTrigger>
              <TabsTrigger value="out">Saída</TabsTrigger>
              {canAdjust ? <TabsTrigger value="adjustment">Ajuste</TabsTrigger> : null}
            </TabsList>

            <TabsContent value="in">
              <MovementEntryForm type="IN" />
            </TabsContent>

            <TabsContent value="out">
              <MovementEntryForm type="OUT" />
            </TabsContent>

            {canAdjust ? (
              <TabsContent value="adjustment">
                <AdjustmentForm />
              </TabsContent>
            ) : null}
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
