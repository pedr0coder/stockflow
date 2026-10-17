import { Controller, Get, HttpStatus, Res } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { HealthService } from './health.service';
import { LivenessResponseDto, ReadinessResponseDto } from './dto/health-response.dto';

/**
 * Endpoints de infraestrutura.
 *
 * Públicos (docs/05-api.md §5.12). Quando os guards globais entrarem na Fase 4,
 * estas duas rotas precisam receber `@Public()`: o padrão do projeto é negar, e
 * sem o decorator o orquestrador passaria a receber 401 no health check.
 */
@ApiTags('Infraestrutura')
@Controller('health')
export class HealthController {
  constructor(private readonly health: HealthService) {}

  @Get()
  @ApiOperation({
    summary: 'Liveness',
    description:
      'Responde 200 enquanto o processo estiver vivo. Não verifica dependências ' +
      'e não revela versão nem detalhe interno.',
  })
  @ApiOkResponse({ type: LivenessResponseDto })
  liveness(): LivenessResponseDto {
    return { status: 'ok' };
  }

  @Get('ready')
  @ApiOperation({
    summary: 'Readiness',
    description:
      'Verifica o banco com SELECT 1. Responde 200 quando a aplicação pode receber ' +
      'tráfego e 503 quando não pode.',
  })
  @ApiOkResponse({ type: ReadinessResponseDto })
  @ApiResponse({ status: HttpStatus.SERVICE_UNAVAILABLE, type: ReadinessResponseDto })
  async readiness(@Res({ passthrough: true }) res: Response): Promise<ReadinessResponseDto> {
    const result = await this.health.checkReadiness();

    // 503 e não 200 com `ready: false`: orquestrador e balanceador decidem pelo
    // status HTTP, não pelo corpo. Responder 200 aqui faria o Kubernetes manter
    // no balanceador uma instância que não consegue atender.
    res.status(result.ready ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE);

    return { status: result.ready ? 'ok' : 'error', database: result.database };
  }
}
