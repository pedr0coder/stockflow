/// <reference types="vite/client" />

/**
 * Tipagem das variáveis de ambiente do frontend.
 *
 * Só a URL da API. Build de frontend é público: qualquer valor aqui é visível
 * para quem abrir o DevTools, então nada que seja segredo entra em `VITE_`
 * (docs/08-seguranca.md §8.10).
 */
interface ImportMetaEnv {
  readonly VITE_API_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
