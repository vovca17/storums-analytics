import { CanActivate, ExecutionContext, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { IS_PUBLIC } from './public.decorator';
import { TokenVerifier } from './token-verifier';
import { UsersService } from '../users/users.service';

@Injectable()
export class AuthGuard implements CanActivate {
  private readonly log = new Logger(AuthGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly verifier: TokenVerifier,
    private readonly users: UsersService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (isPublic) return true;

    const req = ctx.switchToHttp().getRequest<Request>();
    const [scheme, token] = (req.headers.authorization ?? '').split(' ');
    if (scheme !== 'Bearer' || !token) throw new UnauthorizedException('Нет токена');

    let payload;
    try {
      payload = await this.verifier.verify(token);
    } catch (e) {
      // Причина — в лог (просроченный, чужая подпись, не тот issuer), клиенту — общий ответ
      this.log.warn(`токен отклонён: ${(e as Error).message}; ${req.method} ${req.path}`);
      throw new UnauthorizedException('Токен недействителен');
    }
    if (!payload.sub || typeof payload.email !== 'string' || typeof payload.iat !== 'number') {
      throw new UnauthorizedException('В токене нет пользователя');
    }

    const user = { id: payload.sub, email: payload.email, issuedAt: new Date(payload.iat * 1000) };
    if (!(await this.users.ensureExists(user))) {
      this.log.warn(`токен удалённого аккаунта: user=${user.id} ${req.method} ${req.path}`);
      throw new UnauthorizedException('Аккаунт удалён');
    }
    req.user = user;
    return true;
  }
}
