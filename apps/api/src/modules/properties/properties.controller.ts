import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiQuery, ApiTags } from '@nestjs/swagger';
import { CreateProperty, UpdateProperty } from '@storums/shared';
import { ZodPipe } from '../../common/zod.pipe';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthUser } from '../auth/auth.types';
import { PropertiesService } from './properties.service';

@ApiTags('properties')
@ApiBearerAuth()
@Controller('properties')
export class PropertiesController {
  constructor(private readonly properties: PropertiesService) {}

  @Get()
  @ApiQuery({ name: 'archived', required: false, description: 'true — только квартиры в архиве' })
  list(@CurrentUser() user: AuthUser, @Query('archived') archived?: string) {
    return this.properties.list(user.id, archived === 'true');
  }

  @Get(':id')
  get(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.properties.getOwned(user.id, id);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body(new ZodPipe(CreateProperty)) body: CreateProperty) {
    return this.properties.create(user.id, body);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(UpdateProperty)) body: UpdateProperty,
  ) {
    return this.properties.update(user.id, id, body);
  }

  @Delete(':id')
  archive(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.properties.archive(user.id, id);
  }
}
