import { SetMetadata, type CustomDecorator } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/**
 * Marca uma rota como aberta, dispensando autenticação.
 *
 * O padrão do projeto é **negar**: os guards são globais, então qualquer rota
 * sem este decorator exige um token válido. Esquecer o decorator fecha a rota,
 * não a abre, que é a direção correta para um erro de distração
 * (docs/08-seguranca.md §8.3).
 *
 * Usado em exatamente três lugares: as duas rotas de health e o login.
 */
export const Public = (): CustomDecorator<string> => SetMetadata(IS_PUBLIC_KEY, true);
