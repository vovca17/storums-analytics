import { Module } from '@nestjs/common';
import { PropertiesModule } from '../properties/properties.module';
import { AnalyticsService } from './analytics.service';
import { CategoriesService } from './categories.service';
import { AnalyticsController, CategoriesController, TransactionsController } from './finance.controller';
import { TransactionsService } from './transactions.service';

/** Статьи, доходы/расходы и аналитика (графики, налог). */
@Module({
  imports: [PropertiesModule],
  controllers: [CategoriesController, TransactionsController, AnalyticsController],
  providers: [CategoriesService, TransactionsService, AnalyticsService],
})
export class FinanceModule {}
