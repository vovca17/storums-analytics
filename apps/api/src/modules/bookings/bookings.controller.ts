import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { BookingQuery, CreateBooking, UpdateBooking } from '@storums/shared';
import { ZodPipe } from '../../common/zod.pipe';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthUser } from '../auth/auth.types';
import { BookingsService } from './bookings.service';

@ApiTags('bookings')
@ApiBearerAuth()
@Controller('properties/:propertyId/bookings')
export class BookingsController {
  constructor(private readonly bookings: BookingsService) {}

  @Get()
  list(
    @CurrentUser() user: AuthUser,
    @Param('propertyId', ParseUUIDPipe) propertyId: string,
    @Query(new ZodPipe(BookingQuery)) q: BookingQuery,
  ) {
    return this.bookings.list(user.id, propertyId, q);
  }

  @Get(':id')
  get(
    @CurrentUser() user: AuthUser,
    @Param('propertyId', ParseUUIDPipe) propertyId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.bookings.get(user.id, propertyId, id);
  }

  /** 409 — даты пересекаются с другой бронью. */
  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Param('propertyId', ParseUUIDPipe) propertyId: string,
    @Body(new ZodPipe(CreateBooking)) body: CreateBooking,
  ) {
    return this.bookings.create(user.id, propertyId, body);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('propertyId', ParseUUIDPipe) propertyId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(UpdateBooking)) body: UpdateBooking,
  ) {
    return this.bookings.update(user.id, propertyId, id, body);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(
    @CurrentUser() user: AuthUser,
    @Param('propertyId', ParseUUIDPipe) propertyId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.bookings.remove(user.id, propertyId, id);
  }
}
