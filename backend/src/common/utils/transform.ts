/**
 * Transformações de entrada para DTOs.
 *
 * Existem porque o `@Transform` do class-transformer entrega `value` como
 * `any`: usá-lo direto na seta espalharia um `any` por cada DTO do projeto, e
 * a regra `no-unsafe-return` apontaria todos eles, com razão.
 *
 * Concentrando aqui, o `unknown` é estreitado uma vez, em um lugar testável, e
 * os DTOs ficam com uma referência de função legível no lugar de uma seta.
 */

/** Remove espaço nas pontas. Deixa passar o que não for string. */
export function trimValue({ value }: { value: unknown }): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

/**
 * Normaliza para minúsculas, como o banco armazena e-mail.
 *
 * Sem isso, "Ana@x.com" e "ana@x.com" seriam contas diferentes para quem
 * digita, apesar de o índice único tratá-las como a mesma.
 */
export function trimLowerValue({ value }: { value: unknown }): unknown {
  return typeof value === 'string' ? value.trim().toLowerCase() : value;
}

/** Normaliza para maiúsculas, como o banco armazena SKU. */
export function trimUpperValue({ value }: { value: unknown }): unknown {
  return typeof value === 'string' ? value.trim().toUpperCase() : value;
}

/**
 * Converte o booleano da query string.
 *
 * Em query string tudo chega como texto, e `Boolean('false')` é `true`. A
 * conversão precisa ser explícita.
 */
export function toBooleanValue({ value }: { value: unknown }): unknown {
  if (typeof value === 'boolean') {
    return value;
  }

  if (value === 'true') {
    return true;
  }

  if (value === 'false') {
    return false;
  }

  // Valor que não é booleano nem a representação textual dele passa adiante
  // para que o `@IsBoolean()` o recuse com mensagem adequada, em vez de virar
  // `false` em silêncio.
  return value;
}

/** Converte para inteiro, preservando o original quando não for numérico. */
export function toIntValue({ value }: { value: unknown }): unknown {
  if (typeof value === 'number') {
    return value;
  }

  if (typeof value !== 'string') {
    return value;
  }

  const parsed = Number.parseInt(value, 10);

  return Number.isNaN(parsed) ? value : parsed;
}
