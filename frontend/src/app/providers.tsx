import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect, useState, type ReactNode } from 'react';
import { Tooltip } from 'radix-ui';
import { Toaster } from '@/components/ui/sonner';
import { AuthProvider } from '@/features/auth/auth-provider';
import { setDemoCacheResetListener } from '@/features/demo/demo-sandbox';

/**
 * Providers da aplicação.
 *
 * O `QueryClient` entra já na Fase 3, embora a primeira query só apareça na
 * Fase 6, porque ele é parte do shell: colocá-lo depois significaria mexer na
 * árvore de providers com telas já montadas em cima.
 */

/**
 * Cria o `QueryClient` com os padrões explícitos.
 *
 * Os padrões do React Query são pensados para aplicação pública com dado que
 * muda sozinho. Um sistema de estoque interno tem perfil diferente, então cada
 * desvio está justificado abaixo.
 */
function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // Cinco minutos. O operador abre a mesma listagem várias vezes seguidas
        // e não faz sentido ir ao servidor a cada volta de navegação.
        staleTime: 5 * 60 * 1000,

        // Refetch ao focar a janela fica DESLIGADO. Em tela de estoque, o dado
        // mudar sozinho enquanto alguém lê a tabela é desorientador. A
        // atualização acontece por ação: após uma movimentação, por invalidação
        // explícita da query.
        refetchOnWindowFocus: false,

        // Uma repetição. O padrão de três atrasa a mensagem de erro em vários
        // segundos, e o usuário fica olhando para um skeleton sem saber que já
        // falhou.
        retry: 1,
      },
      mutations: {
        // Mutação não repete sozinha. Em movimentação de estoque, repetir uma
        // requisição que pode ter sido aplicada criaria lançamento duplicado.
        retry: 0,
      },
    },
  });
}

export function AppProviders({ children }: { children: ReactNode }): ReactNode {
  // `useState` com função inicial, e não um módulo de nível superior: garante
  // um cliente por montagem da aplicação, o que mantém os testes isolados uns
  // dos outros.
  const [queryClient] = useState(createQueryClient);

  useEffect(() => {
    setDemoCacheResetListener(() => {
      void queryClient.resetQueries();
      void queryClient.invalidateQueries({ refetchType: 'all' });
      void queryClient.refetchQueries({ type: 'all' });
    });

    return () => {
      setDemoCacheResetListener(null);
    };
  }, [queryClient]);

  return (
    <QueryClientProvider client={queryClient}>
      <Tooltip.Provider delayDuration={300}>
        <AuthProvider>
          {children}
          <Toaster position="bottom-right" richColors closeButton />
        </AuthProvider>
      </Tooltip.Provider>
    </QueryClientProvider>
  );
}
