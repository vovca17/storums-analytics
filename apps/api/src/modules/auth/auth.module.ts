import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AuthGuard } from './auth.guard';
import { TokenVerifier } from './token-verifier';
import { UsersModule } from '../users/users.module';
import { RateLimitGuard } from '../../common/rate-limit.guard';

/**
 * Guard включён глобально: все эндпоинты закрыты, кроме помеченных @Public().
 * RateLimitGuard идёт после AuthGuard — считает запросы по проверенному пользователю.
 */
@Module({
  imports: [UsersModule],
  providers: [
    TokenVerifier,
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: RateLimitGuard },
  ],
})
export class AuthModule {}
