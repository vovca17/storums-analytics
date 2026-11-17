import { Module } from '@nestjs/common';
import { PropertiesModule } from '../properties/properties.module';
import { LeasesController } from './leases.controller';
import { LeasesService } from './leases.service';

@Module({
  imports: [PropertiesModule],
  controllers: [LeasesController],
  providers: [LeasesService],
})
export class LeasesModule {}
