import { Module } from '@nestjs/common';
import { StockMovementsController } from './stock-movements.controller';
import { StockMovementsService } from './stock-movements.service';

@Module({
  controllers: [StockMovementsController],
  providers: [StockMovementsService],
  // Exportado para que `ProductsModule` ligue `GET /products/:id/movements`
  // sem duplicar a lógica de consulta.
  exports: [StockMovementsService],
})
export class StockMovementsModule {}
