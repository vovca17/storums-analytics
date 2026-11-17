import { Controller, ForbiddenException, Get, Headers, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiExcludeController } from '@nestjs/swagger';
import { timingSafeEqual } from 'node:crypto';
import { Public } from '../auth/public.decorator';
import { CronService } from './cron.service';

/**
 * Вызывает Vercel Cron (apps/api/vercel.json) с заголовком Authorization: Bearer $CRON_SECRET.
 * Без CRON_SECRET в окружении эндпоинт выключен.
 */
@ApiExcludeController()
@Controller('cron')
export class CronController {
  constructor(
    private readonly cron: CronService,
    private readonly config: ConfigService,
  ) {}

  @Public()
  @Get('daily')
  daily(@Headers('authorization') auth?: string) {
    const secret = this.config.get<string>('CRON_SECRET');
    if (!secret) throw new ServiceUnavailableException('CRON_SECRET не задан');
    const a = Buffer.from(auth ?? '');
    const b = Buffer.from(`Bearer ${secret}`);
    if (a.length !== b.length || !timingSafeEqual(a, b)) throw new ForbiddenException();
    return this.cron.daily();
  }
}
