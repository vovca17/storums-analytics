import { Body, Controller, Delete, Get, HttpCode, Patch } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthUser } from '../auth/auth.types';
import { ZodPipe } from '../../common/zod.pipe';
import { UpdateMe } from './users.schemas';
import { UsersService } from './users.service';

@ApiTags('users')
@ApiBearerAuth()
@Controller('me')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  me(@CurrentUser() user: AuthUser) {
    return this.users.me(user.id);
  }

  /** Удалить аккаунт и все данные безвозвратно. */
  @Delete()
  @HttpCode(204)
  remove(@CurrentUser() user: AuthUser) {
    return this.users.remove(user.id);
  }

  @Patch()
  update(@CurrentUser() user: AuthUser, @Body(new ZodPipe(UpdateMe)) body: UpdateMe) {
    return this.users.update(user.id, body);
  }
}
