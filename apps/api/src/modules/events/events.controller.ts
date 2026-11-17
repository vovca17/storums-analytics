import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CompleteEvent, CreateEvent, RentMark, RentPayment, UpcomingQuery, UpdateEvent } from '@storums/shared';
import { ZodPipe } from '../../common/zod.pipe';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthUser } from '../auth/auth.types';
import { EventsService } from './events.service';

@ApiTags('events')
@ApiBearerAuth()
@Controller('events')
export class EventsController {
  constructor(private readonly events: EventsService) {}

  @Get()
  list(
    @CurrentUser() user: AuthUser,
    @Query('propertyId', new ParseUUIDPipe({ optional: true })) propertyId?: string,
  ) {
    return this.events.list(user.id, propertyId);
  }

  /** Свои события + дни оплаты аренды + окончания договоров, с отметками и просрочкой. */
  @Get('upcoming')
  upcoming(@CurrentUser() user: AuthUser, @Query(new ZodPipe(UpcomingQuery)) q: UpcomingQuery) {
    return this.events.upcoming(user.id, q);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body(new ZodPipe(CreateEvent)) body: CreateEvent) {
    return this.events.create(user.id, body);
  }

  /** Аренда за месяц получена → доход «Арендная плата». */
  @Post('rent')
  @HttpCode(204)
  markRent(@CurrentUser() user: AuthUser, @Body(new ZodPipe(RentPayment)) body: RentPayment) {
    return this.events.markRent(user.id, body);
  }

  @Delete('rent')
  @HttpCode(204)
  unmarkRent(@CurrentUser() user: AuthUser, @Query(new ZodPipe(RentMark)) q: RentMark) {
    return this.events.unmarkRent(user.id, q);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(UpdateEvent)) body: UpdateEvent,
  ) {
    return this.events.update(user.id, id, body);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.events.remove(user.id, id);
  }

  @Post(':id/complete')
  @HttpCode(204)
  complete(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(CompleteEvent)) body: CompleteEvent,
  ) {
    return this.events.complete(user.id, id, body.date);
  }

  @Delete(':id/complete')
  @HttpCode(204)
  uncomplete(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Query(new ZodPipe(CompleteEvent)) q: CompleteEvent,
  ) {
    return this.events.uncomplete(user.id, id, q.date);
  }
}
