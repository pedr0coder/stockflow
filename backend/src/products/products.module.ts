import { Module } from '@nestjs/common';
import { StockMovementsModule } from '../stock-movements/stock-movements.module';
import { ProductsController } from './products.controller';
import { ProductsService } from './products.service';

@Module({
  // `GET /products/:id/movements` (Fase 5) é servido aqui pelo
  // `StockMovementsService`, importado em vez de duplicado.
  imports: [StockMovementsModule],
  controllers: [ProductsController],
  providers: [ProductsService],
  exports: [ProductsService],
})
export class ProductsModule {}
