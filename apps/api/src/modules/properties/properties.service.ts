import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PLAN_LIMITS, todayDate, type CreateProperty, type UpdateProperty } from '@storums/shared';
import { Prisma } from '@storums/db';
import { PrismaService } from '../../prisma/prisma.service';

/** Текущий договор: начался и ещё не закончился (или бессрочный). */
const activeLease = () => {
  const today = todayDate();
  return {
    where: { startDate: { lte: today }, OR: [{ endDate: null }, { endDate: { gte: today } }] },
    orderBy: { startDate: 'desc' as const },
    take: 1,
    select: {
      id: true,
      rentAmount: true,
      startDate: true,
      endDate: true,
      paymentDay: true,
      deposit: true,
      utilitiesPaidBy: true,
      tenant: { select: { id: true, fullName: true, phone: true, email: true, isLegalEntity: true } },
    },
  };
};

@Injectable()
export class PropertiesService {
  constructor(private readonly prisma: PrismaService) {}

  /** Действующие квартиры или, с archived = true, только архив. */
  list(ownerId: string, archived = false) {
    return this.prisma.property.findMany({
      where: { ownerId, status: archived ? 'ARCHIVED' : { not: 'ARCHIVED' } },
      orderBy: { createdAt: 'asc' },
      include: { leases: activeLease() },
    });
  }

  /** Все запросы к квартире идут через этот метод: чужая квартира = 404. */
  async getOwned(ownerId: string, id: string) {
    const p = await this.prisma.property.findFirst({
      where: { id, ownerId },
      include: { leases: activeLease() },
    });
    if (!p) throw new NotFoundException('Квартира не найдена');
    return p;
  }

  /** Все изменения договоров, броней и платежей одной квартиры выполняются по очереди. */
  async lockOwned(tx: Prisma.TransactionClient, ownerId: string, id: string) {
    const rows = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM "Property" WHERE id = ${id}::uuid AND "ownerId" = ${ownerId}::uuid FOR UPDATE
    `;
    if (!rows.length) throw new NotFoundException('Квартира не найдена');
    return tx.property.findUniqueOrThrow({ where: { id } });
  }

  /** Вызывается под блокировкой квартиры. Последний день договора включён. */
  async syncLeaseStatus(tx: Prisma.TransactionClient, id: string, today = todayDate()) {
    const p = await tx.property.findUniqueOrThrow({ where: { id } });
    if (p.status === 'ARCHIVED' || p.dailyRent) return p;
    const active = await tx.lease.count({
      where: { propertyId: id, startDate: { lte: today }, OR: [{ endDate: null }, { endDate: { gte: today } }] },
    });
    const status = active ? 'RENTED' : p.status === 'RENTED' ? 'VACANT' : p.status;
    return status === p.status ? p : tx.property.update({ where: { id }, data: { status } });
  }

  async create(ownerId: string, dto: CreateProperty) {
    await this.checkLimit(ownerId);
    const { purchaseDate, ...rest } = dto;
    return this.prisma.property.create({
      data: { ...rest, ownerId, ...(purchaseDate && { purchaseDate: new Date(purchaseDate) }) },
    });
  }

  async update(ownerId: string, id: string, dto: UpdateProperty) {
    const p = await this.getOwned(ownerId, id);
    // Возврат из архива снова занимает место в лимите тарифа
    if (p.status === 'ARCHIVED' && dto.status && dto.status !== 'ARCHIVED') await this.checkLimit(ownerId);
    return this.prisma.property.update({ where: { id }, data: this.toData(dto) });
  }

  /**
   * Мягкое удаление: история доходов и расходов сохраняется.
   * Действующий договор заканчивается сегодня — иначе после возврата из архива он «оживёт».
   */
  async archive(ownerId: string, id: string) {
    await this.getOwned(ownerId, id);
    const today = todayDate();
    return this.prisma.$transaction(async (tx) => {
      await this.lockOwned(tx, ownerId, id);
      await tx.lease.updateMany({
        where: { propertyId: id, startDate: { lte: today }, OR: [{ endDate: null }, { endDate: { gt: today } }] },
        data: { endDate: today },
      });
      return tx.property.update({ where: { id }, data: { status: 'ARCHIVED' } });
    });
  }

  private async checkLimit(ownerId: string) {
    const sub = await this.prisma.subscription.findUnique({ where: { userId: ownerId } });
    const limit = PLAN_LIMITS[sub?.plan ?? 'FREE'].maxProperties;
    if (limit === null) return;
    const count = await this.prisma.property.count({ where: { ownerId, status: { not: 'ARCHIVED' } } });
    if (count >= limit) throw new ForbiddenException(`На вашем тарифе до ${limit} квартир`);
  }

  private toData(dto: UpdateProperty) {
    const { purchaseDate, mortgage, ...rest } = dto;
    return {
      ...rest,
      // null — дату покупки стёрли
      ...(purchaseDate !== undefined && { purchaseDate: purchaseDate && new Date(purchaseDate) }),
      // null — убрать ипотеку: в Json-поле Prisma пишет NULL только через JsonNull
      ...(mortgage !== undefined && { mortgage: mortgage ?? Prisma.JsonNull }),
    };
  }
}
