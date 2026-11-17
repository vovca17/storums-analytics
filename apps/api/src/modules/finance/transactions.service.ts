import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { CreateTransaction, TransactionQuery, UpdateTransaction } from '@storums/shared';
import type { Prisma } from '@storums/db';
import { PrismaService } from '../../prisma/prisma.service';
import { PropertiesService } from '../properties/properties.service';
import { CategoriesService } from './categories.service';

const SELECT = {
  id: true,
  propertyId: true,
  categoryId: true,
  leaseId: true,
  rentPeriod: true,
  type: true,
  amount: true,
  date: true,
  comment: true,
  source: true,
  isPaid: true,
  bookingId: true,
  eventCompletionId: true,
  property: { select: { title: true } },
  category: { select: { name: true, systemKey: true } },
} satisfies Prisma.TransactionSelect;

/** Условие для операций пользователя по фильтрам. Владение — через квартиру. */
export function transactionWhere(ownerId: string, q: TransactionQuery): Prisma.TransactionWhereInput {
  return {
    property: { ownerId },
    ...(q.propertyId?.length && { propertyId: { in: q.propertyId } }),
    ...(q.categoryId && { OR: [{ categoryId: q.categoryId }, { category: { parentId: q.categoryId } }] }),
    ...(q.type && { type: q.type }),
    ...((q.from || q.to) && {
      date: { ...(q.from && { gte: new Date(q.from) }), ...(q.to && { lte: new Date(q.to) }) },
    }),
  };
}

/** Доход и комиссию брони ведёт сама бронь: ручная правка разошлась бы с ней и затёрлась при следующем сохранении. */
function notFromBooking(tx: { bookingId: string | null }) {
  if (tx.bookingId) throw new BadRequestException('Операция создана бронью — измените или удалите бронь');
}

/** Расход события ведёт отметка «сделано»: снять её можно только в «Событиях». */
function notFromEvent(tx: { eventCompletionId: string | null }) {
  if (tx.eventCompletionId) throw new BadRequestException('Операция создана событием — снимите отметку в «Событиях»');
}

@Injectable()
export class TransactionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly properties: PropertiesService,
    private readonly categories: CategoriesService,
  ) {}

  list(ownerId: string, q: TransactionQuery) {
    return this.prisma.transaction.findMany({
      where: transactionWhere(ownerId, q),
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
      take: q.limit ?? 200,
      select: SELECT,
    });
  }

  async get(ownerId: string, id: string) {
    const tx = await this.prisma.transaction.findFirst({ where: { id, property: { ownerId } }, select: SELECT });
    if (!tx) throw new NotFoundException('Операция не найдена');
    return tx;
  }

  async create(ownerId: string, dto: CreateTransaction) {
    await this.properties.getOwned(ownerId, dto.propertyId);
    const cat = await this.categories.getVisible(ownerId, dto.categoryId);
    if (cat.type !== dto.type) throw new BadRequestException('Статья не подходит к типу операции');
    return this.prisma.$transaction(async (tx) => {
      await this.properties.lockOwned(tx, ownerId, dto.propertyId);
      const rentPeriod = await this.rentPeriod(tx, { ...dto, categoryKey: cat.systemKey });
      return tx.transaction.create({
        data: { ...dto, rentPeriod, date: new Date(dto.date) },
        select: SELECT,
      });
    });
  }

  async update(ownerId: string, id: string, dto: UpdateTransaction) {
    const cur = await this.getOwned(ownerId, id);
    return this.prisma.$transaction(async (tx) => {
      await this.properties.lockOwned(tx, ownerId, cur.propertyId);
      const current = await tx.transaction.findUnique({ where: { id } });
      if (!current) throw new NotFoundException('Операция не найдена');
      notFromBooking(current);
      notFromEvent(current);
      const cat = await this.categories.getVisible(ownerId, dto.categoryId ?? current.categoryId);
      if (cat.type !== current.type) throw new BadRequestException('Статья не подходит к типу операции');
      const date = dto.date ?? current.date.toISOString().slice(0, 10);
      const isRent = cat.systemKey === 'rent' && current.type === 'INCOME' && current.leaseId;
      const rentPeriod = await this.rentPeriod(tx, {
        propertyId: current.propertyId, leaseId: current.leaseId, type: current.type,
        categoryKey: cat.systemKey, date,
        rentPeriod: dto.rentPeriod === undefined ? (isRent ? current.rentPeriod : null) : dto.rentPeriod,
      });
      const { date: _date, ...rest } = dto;
      return tx.transaction.update({
        where: { id }, data: { ...rest, rentPeriod, date: new Date(date) }, select: SELECT,
      });
    });
  }

  async remove(ownerId: string, id: string) {
    const current = await this.getOwned(ownerId, id);
    await this.prisma.$transaction(async (tx) => {
      await this.properties.lockOwned(tx, ownerId, current.propertyId);
      const row = await tx.transaction.findUnique({ where: { id } });
      if (!row) throw new NotFoundException('Операция не найдена');
      notFromBooking(row);
      notFromEvent(row);
      await tx.transaction.delete({ where: { id } });
    });
  }

  private async rentPeriod(tx: Prisma.TransactionClient, input: {
    propertyId: string; leaseId?: string | null; type: string; categoryKey: string | null;
    date: string; rentPeriod?: string | null;
  }) {
    const lease = input.leaseId
      ? await tx.lease.findFirst({ where: { id: input.leaseId, propertyId: input.propertyId } })
      : null;
    if (input.leaseId && !lease) throw new NotFoundException('Договор не найден');
    if (input.categoryKey !== 'rent' || input.type !== 'INCOME' || !lease) {
      if (input.rentPeriod) throw new BadRequestException('Месяц аренды указывается только для арендного дохода по договору');
      return null;
    }
    const period = input.rentPeriod ?? input.date.slice(0, 7);
    if (period < lease.startDate.toISOString().slice(0, 7) || (lease.endDate && period > lease.endDate.toISOString().slice(0, 7))) {
      throw new BadRequestException('В выбранном месяце договор не действует');
    }
    return period;
  }

  /** Чужая операция = 404. */
  async getOwned(ownerId: string, id: string) {
    const tx = await this.prisma.transaction.findFirst({ where: { id, property: { ownerId } } });
    if (!tx) throw new NotFoundException('Операция не найдена');
    return tx;
  }
}
