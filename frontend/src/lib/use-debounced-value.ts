import { useEffect, useState } from 'react';

/**
 * Atrasa a propagação de um valor que muda rápido (texto de busca), para que
 * a busca na API dispare quando a pessoa **para** de digitar, não a cada
 * tecla. Usado pelas listagens de fornecedores e produtos, que a API pagina
 * no servidor — sem isto, cada letra digitada seria uma requisição.
 */
export function useDebouncedValue<T>(value: T, delayMs = 400): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timeout = setTimeout(() => {
      setDebounced(value);
    }, delayMs);

    return () => {
      clearTimeout(timeout);
    };
  }, [value, delayMs]);

  return debounced;
}
