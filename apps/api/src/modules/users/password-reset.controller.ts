import {
  Body,
  Controller,
  Headers,
  HttpCode,
  NotFoundException,
  Post,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiExcludeController } from '@nestjs/swagger';
import { timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { ZodPipe } from '../../common/zod.pipe';
import { Public } from '../auth/public.decorator';
import { UsersService } from './users.service';

const EmailQuery = z.object({ email: z.string().trim().toLowerCase().email().max(254) });

/**
 * Служебный эндпоинт для страницы «Забыли пароль»: есть ли такая почта.
 * Ответ раскрывает, кто зарегистрирован, поэтому вызывать его может только сервер web
 * с заголовком X-Internal-Secret. Ограничение числа проверок с одного адреса — в web,
 * где известен адрес посетителя. Без INTERNAL_API_SECRET эндпоинт выключен.
 */
@ApiExcludeController()
@Controller('auth')
export class PasswordResetController {
  constructor(
    private readonly users: UsersService,
    private readonly config: ConfigService,
  ) {}

  @Public()
  @Post('email-exists')
  @HttpCode(200)
  async emailExists(
    @Headers('x-internal-secret') secret: string | undefined,
    @Body(new ZodPipe(EmailQuery)) body: z.infer<typeof EmailQuery>,
  ) {
    const expected = this.config.get<string>('INTERNAL_API_SECRET');
    if (!expected) throw new ServiceUnavailableException('Проверка почты выключена');
    const a = Buffer.from(secret ?? '');
    const b = Buffer.from(expected);
    // Чужому делаем вид, что эндпоинта нет
    if (a.length !== b.length || !timingSafeEqual(a, b)) throw new NotFoundException();
    return { exists: await this.users.emailExists(body.email) };
  }
}
