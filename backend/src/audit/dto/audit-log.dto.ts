import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Registro do log, como a API o devolve.
 *
 * `before` e `after` chegam já redigidos: a remoção acontece na gravação, não
 * na leitura. Redigir só na saída deixaria o segredo gravado no banco, que é
 * exatamente o que a §4.4 proíbe.
 */
export class AuditLogDto {
  @ApiProperty()
  id!: string;

  @ApiPropertyOptional({ nullable: true })
  userId!: string | null;

  @ApiPropertyOptional({ nullable: true, description: 'Preservado mesmo sem usuário.' })
  actorEmail!: string | null;

  @ApiProperty({ example: 'PRODUCT_UPDATED' })
  action!: string;

  @ApiPropertyOptional({ nullable: true, example: 'Product' })
  entity!: string | null;

  @ApiPropertyOptional({ nullable: true })
  entityId!: string | null;

  @ApiPropertyOptional({ nullable: true, description: 'Estado anterior, já redigido.' })
  before!: unknown;

  @ApiPropertyOptional({ nullable: true, description: 'Estado posterior, já redigido.' })
  after!: unknown;

  @ApiPropertyOptional({ nullable: true })
  ip!: string | null;

  @ApiPropertyOptional({ nullable: true })
  userAgent!: string | null;

  @ApiProperty()
  createdAt!: Date;
}
