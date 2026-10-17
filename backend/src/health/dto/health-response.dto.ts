import { ApiProperty } from '@nestjs/swagger';

/**
 * DTOs de resposta existem para que o Swagger descreva o corpo de verdade.
 *
 * `@nestjs/swagger` gera o OpenAPI a partir dos metadados de decorator: sem uma
 * classe anotada, o schema da resposta sairia vazio na documentação. É o mesmo
 * motivo pelo qual o backend usa class-validator em vez de Zod (ADR-0002).
 */
export class LivenessResponseDto {
  @ApiProperty({ example: 'ok', enum: ['ok'] })
  status!: 'ok';
}

export class ReadinessResponseDto {
  @ApiProperty({ example: 'ok', enum: ['ok', 'error'] })
  status!: 'ok' | 'error';

  @ApiProperty({
    example: 'up',
    enum: ['up', 'down'],
    description: 'Resultado do SELECT 1 no PostgreSQL.',
  })
  database!: 'up' | 'down';
}
