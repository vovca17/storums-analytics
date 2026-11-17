import { Module } from '@nestjs/common';
import { CronController } from './cron.controller';
import { CronService } from './cron.service';
import { PropertiesModule } from '../properties/properties.module';

/** Ежедневные фоновые задачи (Vercel Cron). */
@Module({ imports: [PropertiesModule], controllers: [CronController], providers: [CronService] })
export class CronModule {}
