import { CanActivate, ExecutionContext, HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request, Response } from 'express';
import { IS_PUBLIC } from '../modules/auth/public.decorator';

/** Лимиты на одного пользователя за минуту: чтение и запись отдельно. */
export const RATE_LIMITS = { read: 300, write: 60 } as const;
const WINDOW_MS = 60_000;

/**
 * Ограничение частоты запросов: фиксированное окно в минуту на проверенного пользователя.
 * Хранится в памяти экземпляра: на Vercel у каждого экземпляра своё окно — это защита от
 * перебора и случайных циклов, а не точный учёт. Для точного — Redis (Upstash) позже.
 * Публичные маршруты (health, cron) не считаем: без пользователя ключом был бы IP прокси,
 * общий для всех, и чужой поток запросов к health блокировал бы cron.
 */
@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly hits = new Map<string, { count: number; resetAt: number }>();
  private readonly log = new Logger(RateLimitGuard.name);

  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [ctx.getHandler(), ctx.getClass()])) return true;

    const req = ctx.switchToHttp().getRequest<Request>();
    const res = ctx.switchToHttp().getResponse<Response>();
    const userId = req.user?.id;
    if (!userId) return true; // сюда не дойдёт: AuthGuard стоит раньше и без пользователя отвечает 401

    const write = !['GET', 'HEAD', 'OPTIONS'].includes(req.method);
    const limit = write ? RATE_LIMITS.write : RATE_LIMITS.read;
    const key = `${write ? 'w' : 'r'}:${userId}`;
    const now = Date.now();

    let entry = this.hits.get(key);
    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + WINDOW_MS };
      this.hits.set(key, entry);
      if (this.hits.size > 10_000) this.sweep(now);
    }
    entry.count++;
    res.setHeader('X-RateLimit-Limit', String(limit));
    res.setHeader('X-RateLimit-Remaining', String(Math.max(0, limit - entry.count)));
    if (entry.count > limit) {
      res.setHeader('Retry-After', String(Math.ceil((entry.resetAt - now) / 1000)));
      // Логируем один раз на окно, чтобы поток запросов не превращался в поток логов
      if (entry.count === limit + 1) this.log.warn(`429 user=${userId} ${req.method} ${req.path}`);
      throw new HttpException('Слишком много запросов. Подождите минуту.', HttpStatus.TOO_MANY_REQUESTS);
    }
    return true;
  }

  private sweep(now: number) {
    for (const [k, v] of this.hits) if (v.resetAt <= now) this.hits.delete(k);
  }
}
