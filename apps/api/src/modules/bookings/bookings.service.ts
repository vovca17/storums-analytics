import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { D, type BookingQuery, type CreateBooking, type UpdateBooking } from '@storums/shared';
import type { Prisma } from '@storums/db';
import { PrismaService } from '../../prisma/prisma.service';
import { PropertiesService } from '../properties/properties.service';

type Tx = Prisma.TransactionClient;
const iso = (d: Date) => d.toISOString().slice(0, 10);

@Injectable()
export class BookingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly properties: PropertiesService,
  ) {}

  /** Брони, задевающие отрезок [from, to]. */
  async list(ownerId: string, propertyId: string, q: BookingQuery) {
    await this.properties.getOwned(ownerId, propertyId);
    return this.prisma.booking.findMany({
      where: {
        propertyId,
        ...(q.to && { checkIn: { lte: new Date(q.to) } }),
        ...(q.from && { checkOut: { gt: new Date(q.from) } }),
      },
      orderBy: { checkIn: 'asc' },
    });
  }

  async get(ownerId: string, propertyId: string, id: string) {
    await this.properties.getOwned(ownerId, propertyId);
    const b = await this.prisma.booking.findFirst({ where: { id, propertyId } });
    if (!b) throw new NotFoundException('Бронь не найдена');
    return b;
  }

  async create(ownerId: string, propertyId: string, dto: CreateBooking) {
    await this.properties.getOwned(ownerId, propertyId);
    return this.prisma.$transaction(async (tx) => {
      const property = await this.properties.lockOwned(tx, ownerId, propertyId);
      if (property.status === 'ARCHIVED') throw new BadRequestException('Сначала верните квартиру из архива');
      await this.assertFree(tx, propertyId, dto.checkIn, dto.checkOut);
      const b = await tx.booking.create({
        data: { ...dto, propertyId, checkIn: new Date(dto.checkIn), checkOut: new Date(dto.checkOut) },
      });
      await this.syncTransactions(tx, b.id);
      return b;
    });
  }

  async update(ownerId: string, propertyId: string, id: string, dto: UpdateBooking) {
    await this.properties.getOwned(ownerId, propertyId);
    return this.prisma.$transaction(async (tx) => {
      await this.properties.lockOwned(tx, ownerId, propertyId);
      const cur = await tx.booking.findFirst({ where: { id, propertyId } });
      if (!cur) throw new NotFoundException('Бронь не найдена');
      const checkIn = dto.checkIn ?? iso(cur.checkIn);
      const checkOut = dto.checkOut ?? iso(cur.checkOut);
      if (checkOut <= checkIn) throw new ConflictException('Выезд должен быть позже заезда');
      await this.assertFree(tx, propertyId, checkIn, checkOut, id);
      const { checkIn: _i, checkOut: _o, ...rest } = dto;
      const b = await tx.booking.update({
        where: { id },
        data: { ...rest, checkIn: new Date(checkIn), checkOut: new Date(checkOut) },
      });
      await this.syncTransactions(tx, id);
      return b;
    });
  }

  /** Удаление брони удаляет и созданные из неё операции (каскад). */
  async remove(ownerId: string, propertyId: string, id: string) {
    await this.properties.getOwned(ownerId, propertyId);
    await this.prisma.$transaction(async (tx) => {
      await this.properties.lockOwned(tx, ownerId, propertyId);
      const b = await tx.booking.findFirst({ where: { id, propertyId } });
      if (!b) throw new NotFoundException('Бронь не найдена');
      await tx.booking.delete({ where: { id } });
    });
  }

  /** Нельзя занять ночи, которые уже заняты другой бронью. */
  private async assertFree(tx: Tx, propertyId: string, checkIn: string, checkOut: string, exceptId?: string) {
    const clash = await tx.booking.findFirst({
      where: {
        propertyId,
        ...(exceptId && { id: { not: exceptId } }),
        checkIn: { lt: new Date(checkOut) },
        checkOut: { gt: new Date(checkIn) },
      },
    });
    if (clash) {
      const ru = (d: Date) => d.toLocaleDateString('ru-RU', { timeZone: 'UTC' });
      throw new ConflictException(`Даты заняты: ${clash.guestName}, ${ru(clash.checkIn)} — ${ru(clash.checkOut)}`);
    }
  }

  /**
   * Оплаченная бронь → доход «Посуточная аренда» (проживание + уборка) и расход «Комиссия площадки».
   * Пересоздаём при каждом изменении брони; неоплаченная бронь операций не имеет.
   */
  private async syncTransactions(tx: Tx, bookingId: string) {
    const b = await tx.booking.findUniqueOrThrow({ where: { id: bookingId } });
    await tx.transaction.deleteMany({ where: { bookingId } });
    if (!b.isPaid) return;
    const [income, fee] = await Promise.all([
      tx.category.findUniqueOrThrow({ where: { systemKey: 'daily_rent' } }),
      tx.category.findUniqueOrThrow({ where: { systemKey: 'platform_fee' } }),
    ]);
    const total = D(b.amount.toString()).plus(b.cleaningFee?.toString() ?? 0);
    const base = { propertyId: b.propertyId, bookingId, date: b.checkIn, source: 'BOOKING' as const };
    const ru = (d: Date) => d.toLocaleDateString('ru-RU', { timeZone: 'UTC' });
    const comment = `${b.guestName}, ${ru(b.checkIn)} — ${ru(b.checkOut)}`;
    await tx.transaction.create({
      data: { ...base, type: 'INCOME', categoryId: income.id, amount: total.toFixed(2), comment },
    });
    if (b.commission && D(b.commission.toString()).gt(0)) {
      await tx.transaction.create({
        data: { ...base, type: 'EXPENSE', categoryId: fee.id, amount: b.commission, comment },
      });
    }
  }
}
