import { Module } from '@nestjs/common';
import { PropertiesModule } from '../properties/properties.module';
import { EventsController } from './events.controller';
import { EventsService } from './events.service';

/** События, отметки «сделано/оплачено», дни оплаты аренды и окончания договоров. */
@Module({
  imports: [PropertiesModule],
  controllers: [EventsController],
  providers: [EventsService],
})
export class EventsModule {}
