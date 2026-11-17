import { Injectable, InternalServerErrorException, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@storums/db';
import { PrismaService } from '../../prisma/prisma.service';
import type { AuthUser } from '../auth/auth.types';
import type { UpdateMe } from './users.schemas';

@Injectable()
export class UsersService {
  /** Кэш в памяти: не ходим в базу на каждый запрос уже известного пользователя. */
  private readonly known = new Set<string>();
  /** Параллельные запросы нового пользователя ждут одно создание, а не создают его дважды. */
  private readonly pending = new Map<string, Promise<boolean>>();

  private readonly log = new Logger(UsersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  /**
   * При первом входе создаёт User и бета-подписку.
   * false — аккаунт удалён, а токен выдан раньше удаления: такой токен ещё час формально
   * действителен, но пересоздавать по нему пустого пользователя нельзя.
   */
  async ensureExists(user: AuthUser): Promise<boolean> {
    if (this.known.has(user.id)) return true;
    let job = this.pending.get(user.id);
    if (!job) {
      job = this.create(user).finally(() => this.pending.delete(user.id));
      this.pending.set(user.id, job);
    }
    return job;
  }

  private async create(user: AuthUser): Promise<boolean> {
    const deleted = await this.prisma.deletedUser.findUnique({ where: { id: user.id } });
    if (deleted && user.issuedAt <= deleted.deletedAt) return false;
    try {
      await this.prisma.user.upsert({
        where: { id: user.id },
        update: {},
        create: { id: user.id, email: user.email, subscription: { create: { plan: 'BETA' } } },
      });
    } catch (e) {
      // Другой экземпляр API успел создать пользователя раньше — это нормально
      if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002')) throw e;
    }
    this.known.add(user.id);
    return true;
  }

  me(userId: string) {
    return this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      include: { subscription: true },
    });
  }

  async emailExists(email: string): Promise<boolean> {
    if (this.isLocal()) {
      return (await this.prisma.user.count({ where: { email: { equals: email, mode: 'insensitive' } } })) > 0;
    }
    // User появляется только при первом запросе к API. Источник регистрации — Supabase Auth.
    // Читаем через серверное подключение Prisma; auth.users не открываем через публичный REST.
    const [result] = await this.prisma.$queryRaw<Array<{ exists: boolean }>>`
      SELECT EXISTS (
        SELECT 1 FROM auth.users
        WHERE lower(email) = ${email} AND deleted_at IS NULL
      ) AS "exists"
    `;
    return result.exists;
  }

  update(userId: string, data: UpdateMe) {
    const { dashboardLayout, ...rest } = data;
    return this.prisma.user.update({
      where: { id: userId },
      data: {
        ...rest,
        // Json-поле: NULL пишется через Prisma.JsonNull, undefined — не трогать
        ...(dashboardLayout !== undefined && { dashboardLayout: dashboardLayout === null ? Prisma.JsonNull : dashboardLayout }),
      },
    });
  }

  /**
   * Удаление аккаунта (152-ФЗ): все данные пользователя, затем вход в Supabase Auth.
   * Порядок явный: у операций (→ статья) и договоров (→ арендатор) связи RESTRICT.
   * Сначала база: если упадёт удаление входа, человек увидит пустой кабинет, а не останутся данные без владельца.
   */
  async remove(userId: string): Promise<void> {
    // Без ключа вход не удалить — тогда не трогаем и данные, чтобы не удалить их наполовину
    if (!this.isLocal() && !this.config.get<string>('SUPABASE_SERVICE_ROLE_KEY')) {
      this.log.error('Нет SUPABASE_SERVICE_ROLE_KEY — удаление аккаунтов недоступно');
      throw new ServiceUnavailableException('Удаление аккаунта временно недоступно. Напишите в поддержку.');
    }
    await this.prisma.$transaction([
      this.prisma.transaction.deleteMany({ where: { property: { ownerId: userId } } }),
      this.prisma.property.deleteMany({ where: { ownerId: userId } }), // каскадом: договоры, брони, счётчики, события квартиры
      this.prisma.tenant.deleteMany({ where: { ownerId: userId } }),
      this.prisma.event.deleteMany({ where: { ownerId: userId } }),
      this.prisma.category.deleteMany({ where: { ownerId: userId } }),
      this.prisma.user.delete({ where: { id: userId } }), // каскадом: подписка, тарифы, файлы
      // Метка удаления: токены, выданные до неё, больше не принимаются (см. ensureExists)
      this.prisma.deletedUser.upsert({ where: { id: userId }, update: { deletedAt: new Date() }, create: { id: userId } }),
    ]);
    this.known.delete(userId);
    this.log.warn(`аккаунт удалён: user=${userId}`);
    await this.deleteAuthUser(userId);
  }

  private isLocal() {
    return this.config.get<string>('SUPABASE_URL')!.includes('local.storums');
  }

  private async deleteAuthUser(userId: string) {
    if (this.isLocal()) return; // локальный вход — учётки в Supabase нет
    const url = this.config.get<string>('SUPABASE_URL')!;
    const key = this.config.get<string>('SUPABASE_SERVICE_ROLE_KEY')!;
    const res = await fetch(`${url}/auth/v1/admin/users/${userId}`, {
      method: 'DELETE',
      headers: { apikey: key, Authorization: `Bearer ${key}` },
    });
    if (!res.ok && res.status !== 404) {
      this.log.error(`Supabase Auth: не удалось удалить ${userId}: ${res.status} ${await res.text()}`);
      throw new InternalServerErrorException('Данные удалены, но вход не удалён. Напишите в поддержку.');
    }
  }
}
