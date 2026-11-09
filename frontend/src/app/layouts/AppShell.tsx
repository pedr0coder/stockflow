import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Outlet, useLocation } from 'react-router';
import { Header } from '@/components/layout/Header';
import { Sidebar } from '@/components/layout/Sidebar';
import { useAuth } from '@/features/auth/auth-context';

/**
 * Casca da aplicação autenticada: faixa de aviso, sidebar, cabeçalho e área de
 * conteúdo.
 *
 * O estado de colapso vive aqui, e não dentro da `Sidebar`, porque o botão que
 * o controla está no `Header`. Mantê-lo no ancestral comum é o que faz o estado
 * sobreviver à navegação: o `AppShell` permanece montado enquanto só o
 * `Outlet` troca.
 */
export function AppShell(): ReactNode {
  const { user } = useAuth();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const { pathname } = useLocation();
  const contentRef = useRef<HTMLElement>(null);

  /**
   * Volta ao topo a cada navegação.
   *
   * Quem rola o conteúdo é o `main`, não a janela, então o comportamento
   * padrão do navegador não se aplica e o `ScrollRestoration` do React Router
   * também não: ele cuida da janela. Sem isto, sair do fim de uma listagem
   * longa e abrir outra tela deixa a pessoa no meio da página nova, sem ver o
   * título.
   */
  useEffect(() => {
    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    contentRef.current?.scrollTo({
      top: 0,
      behavior: prefersReducedMotion ? 'instant' : 'auto',
    });
  }, [pathname]);

  if (!user) {
    // A rota protegida já garante a sessão. Esta guarda existe para o tipo, e
    // para falhar de forma visível caso alguém monte o shell fora da rota.
    return null;
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <a
        href="#conteudo"
        onClick={(event) => {
          event.preventDefault();
          contentRef.current?.focus();
        }}
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-(--radius-md) focus:bg-primary focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:text-primary-foreground focus:shadow-md focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:outline-hidden"
      >
        Pular para o conteúdo
      </a>

      <div className="flex flex-1 overflow-hidden">
        <Sidebar
          role={user.role}
          collapsed={collapsed}
          mobileOpen={mobileOpen}
          onMobileOpenChange={setMobileOpen}
        />

        <div className="flex min-w-0 flex-1 flex-col">
          <Header
            collapsed={collapsed}
            onToggleCollapse={() => {
              setCollapsed((value) => !value);
            }}
            onOpenMobileNav={() => {
              setMobileOpen(true);
            }}
          />

          {/* `main` com id e tabIndex={-1} para receber o foco do atalho "Pular para o conteúdo". */}
          <main
            ref={contentRef}
            id="conteudo"
            tabIndex={-1}
            className="flex-1 overflow-y-auto p-4 outline-hidden sm:p-6"
          >
            <div className="mx-auto w-full max-w-7xl">
              <Outlet />
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}
