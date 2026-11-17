import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { validateEnv } from './config';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { PropertiesModule } from './modules/properties/properties.module';
import { LeasesModule } from './modules/leases/leases.module';
import { FinanceModule } from './modules/finance/finance.module';
import { EventsModule } from './modules/events/events.module';
import { BookingsModule } from './modules/bookings/bookings.module';
import { CronModule } from './modules/cron/cron.module';
import { HealthController } from './modules/health/health.controller';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    ScheduleModule.forRoot(),
    PrismaModule,
    AuthModule,
    UsersModule,
    PropertiesModule,
    LeasesModule,
    FinanceModule,
    EventsModule,
    BookingsModule,
    CronModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
