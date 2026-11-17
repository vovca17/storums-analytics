import { Module } from '@nestjs/common';
import { PropertiesModule } from '../properties/properties.module';
import { BookingsController } from './bookings.controller';
import { BookingsService } from './bookings.service';

/** Посуточная аренда: брони, проверка дат, доходы из оплаченных броней. */
@Module({
  imports: [PropertiesModule],
  controllers: [BookingsController],
  providers: [BookingsService],
})
export class BookingsModule {}
