import { Body, Controller, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CreateLease, EndLease, UpdateLease } from '@storums/shared';
import { ZodPipe } from '../../common/zod.pipe';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthUser } from '../auth/auth.types';
import { LeasesService } from './leases.service';

@ApiTags('leases')
@ApiBearerAuth()
@Controller('properties/:propertyId/leases')
export class LeasesController {
  constructor(private readonly leases: LeasesService) {}

  /** Новый договор. Текущий, если есть, закрывается накануне — так меняется арендатор. */
  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Param('propertyId', ParseUUIDPipe) propertyId: string,
    @Body(new ZodPipe(CreateLease)) body: CreateLease,
  ) {
    return this.leases.create(user.id, propertyId, body);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('propertyId', ParseUUIDPipe) propertyId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(UpdateLease)) body: UpdateLease,
  ) {
    return this.leases.update(user.id, propertyId, id, body);
  }

  @Post(':id/end')
  end(
    @CurrentUser() user: AuthUser,
    @Param('propertyId', ParseUUIDPipe) propertyId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(EndLease)) body: EndLease,
  ) {
    return this.leases.end(user.id, propertyId, id, body);
  }
}
