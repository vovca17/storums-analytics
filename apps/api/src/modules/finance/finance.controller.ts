import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  CreateCategory,
  CreateTransaction,
  TaxQuery,
  TransactionQuery,
  UpdateTransaction,
} from '@storums/shared';
import { ZodPipe } from '../../common/zod.pipe';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthUser } from '../auth/auth.types';
import { AnalyticsService } from './analytics.service';
import { CategoriesService } from './categories.service';
import { TransactionsService } from './transactions.service';

@ApiTags('categories')
@ApiBearerAuth()
@Controller('categories')
export class CategoriesController {
  constructor(private readonly categories: CategoriesService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.categories.list(user.id);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body(new ZodPipe(CreateCategory)) body: CreateCategory) {
    return this.categories.create(user.id, body);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.categories.remove(user.id, id);
  }
}

@ApiTags('transactions')
@ApiBearerAuth()
@Controller('transactions')
export class TransactionsController {
  constructor(private readonly transactions: TransactionsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query(new ZodPipe(TransactionQuery)) q: TransactionQuery) {
    return this.transactions.list(user.id, q);
  }

  @Get(':id')
  get(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.transactions.get(user.id, id);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body(new ZodPipe(CreateTransaction)) body: CreateTransaction) {
    return this.transactions.create(user.id, body);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(UpdateTransaction)) body: UpdateTransaction,
  ) {
    return this.transactions.update(user.id, id, body);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.transactions.remove(user.id, id);
  }
}

@ApiTags('analytics')
@ApiBearerAuth()
@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  /** Доходы/расходы по месяцам и структура расходов; фильтры как у списка операций. */
  @Get('monthly')
  monthly(@CurrentUser() user: AuthUser, @Query(new ZodPipe(TransactionQuery)) q: TransactionQuery) {
    return this.analytics.monthly(user.id, q);
  }

  /** Чистая доходность квартир за последние 12 месяцев: доходы − расходы − налог, ипотека отдельно. */
  @Get('yield')
  yield(@CurrentUser() user: AuthUser) {
    return this.analytics.yield(user.id);
  }

  @Get('tax')
  tax(@CurrentUser() user: AuthUser, @Query(new ZodPipe(TaxQuery)) q: TaxQuery) {
    return this.analytics.tax(user.id, q.year);
  }
}
