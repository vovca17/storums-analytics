import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  addDays,
  D,
  EVENT_EXPENSE_NEEDS,
  eventExpenseReady,
  expenseCategoryKey,
  rentBalance,
  clampDate,
  occurrences,
  todayIso,
  type CreateEvent,
  type RentMark,
  type RentPayment,
  type UpcomingQuery,
  type UpdateEvent,
} from '@storums/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { PropertiesService } from '../properties/properties.service';

const iso = (d: Date) => d.toISOString().slice(0, 10);
/** Насколько назад показываем невыполненное */
const OVERDUE_LOOKBACK_DAYS = 60;
const RENT_REMIND_DAYS = 3;
const LEASE_END_REMIND_DAYS = 30;
/** Доход, который закрывает аренду за месяц */
const RENT_INCOME = { type: 'INCOME' as const, category: { systemKey: 'rent' } };

export type UpcomingSource = 'EVENT' | 'RENT' | 'LEASE_END';

export interface UpcomingItem {
  /** Стабильный ключ строки */
  key: string;
  source: UpcomingSource;
  eventId?: string;
  leaseId?: string;
  propertyId: string | null;
  propertyTitle: string | null;
  title: string;
  kind: string;
  date: string;
  amount: string | null;
  period?: string;
  paidAmount?: string;
  remainingAmount?: string;
  overpaidAmount?: string;
  canUndoPayment?: boolean;
  /** null — отмечать нечего (окончание договора) */
  done: boolean | null;
  overdue: boolean;
  /** Пора напомнить: не сделано и (просрочено или дата в окне напоминания) */
  attention: boolean;
  recurrence: string;
}

@Injectable()
export class EventsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly properties: PropertiesService,
  ) {}

  list(ownerId: string, propertyId?: string) {
    return this.prisma.event.findMany({
      where: { ownerId, ...(propertyId && { propertyId }) },
      orderBy: { date: 'asc' },
      include: { property: { select: { title: true } } },
    });
  }

  async create(ownerId: string, dto: CreateEvent) {
    if (dto.propertyId) await this.properties.getOwned(ownerId, dto.propertyId);
    return this.prisma.event.create({ data: { ...dto, ownerId, date: new Date(dto.date) } });
  }

  async update(ownerId: string, id: string, dto: UpdateEvent) {
    const cur = await this.getOwned(ownerId, id);
    if (dto.propertyId) await this.properties.getOwned(ownerId, dto.propertyId);
    // Итоговое состояние события: расход нужен и квартира с суммой
    const propertyId = dto.propertyId === undefined ? cur.propertyId : dto.propertyId;
    const amount = dto.amount === undefined ? cur.amount?.toString() : dto.amount;
    if ((dto.countAsExpense ?? cur.countAsExpense) && !eventExpenseReady(propertyId, amount)) {
      throw new BadRequestException(EVENT_EXPENSE_NEEDS);
    }
    const { date, ...rest } = dto;
    return this.prisma.event.update({ where: { id }, data: { ...rest, ...(date && { date: new Date(date) }) } });
  }

  async remove(ownerId: string, id: string) {
    await this.getOwned(ownerId, id);
    await this.prisma.event.delete({ where: { id } });
  }

  async complete(ownerId: string, id: string, date: string) {
    const ev = await this.getOwned(ownerId, id);
    if (!occurrences(iso(ev.date), ev.recurrence, date, date).length) {
      throw new BadRequestException('В этот день события нет');
    }
    await this.prisma.$transaction(async (tx) => {
      const completion = await tx.eventCompletion.upsert({
        where: { eventId_occurrenceDate: { eventId: id, occurrenceDate: new Date(date) } },
        update: {},
        create: { eventId: id, occurrenceDate: new Date(date) },
        include: { transaction: { select: { id: true } } },
      });
      if (!ev.countAsExpense || !ev.propertyId || !ev.amount || completion.transaction) return;
      const category = await tx.category.findFirstOrThrow({
        where: { ownerId: null, systemKey: expenseCategoryKey(ev.kind) },
      });
      await tx.transaction.create({
        data: {
          propertyId: ev.propertyId, categoryId: category.id, type: 'EXPENSE', amount: ev.amount,
          date: new Date(date), comment: ev.title, source: 'MANUAL', isPaid: true,
          eventCompletionId: completion.id,
        },
      });
    });
  }

  async uncomplete(ownerId: string, id: string, date: string) {
    await this.getOwned(ownerId, id);
    await this.prisma.$transaction(async (tx) => {
      const where = { eventId: id, occurrenceDate: new Date(date) };
      await tx.transaction.deleteMany({ where: { eventCompletion: where } });
      await tx.eventCompletion.deleteMany({ where });
    });
  }

  /** Получение аренды: дата денег и оплачиваемый месяц хранятся независимо. */
  async markRent(ownerId: string, dto: RentPayment) {
    const initial = await this.getLease(ownerId, dto.leaseId);
    await this.prisma.$transaction(async (tx) => {
      const property = await this.properties.lockOwned(tx, ownerId, initial.propertyId);
      if (property.status === 'ARCHIVED') throw new BadRequestException('Сначала верните квартиру из архива');
      const lease = await tx.lease.findUniqueOrThrow({ where: { id: dto.leaseId } });
      if (dto.period < iso(lease.startDate).slice(0, 7) || (lease.endDate && dto.period > iso(lease.endDate).slice(0, 7))) {
        throw new BadRequestException('В этом месяце договор не действует');
      }
      if (dto.paymentKey) {
        const previous = await tx.transaction.findUnique({ where: { paymentKey: dto.paymentKey } });
        if (previous) {
          if (previous.leaseId !== lease.id || previous.rentPeriod !== dto.period ||
              (dto.amount && !D(previous.amount.toString()).eq(dto.amount)) ||
              (dto.date && iso(previous.date) !== dto.date)) {
            throw new BadRequestException('Этот ключ платежа уже использован. Обновите форму.');
          }
          return;
        }
      }
      const payments = await tx.transaction.aggregate({
        where: { leaseId: lease.id, rentPeriod: dto.period, ...RENT_INCOME, isPaid: true },
        _sum: { amount: true },
      });
      const remaining = D(lease.rentAmount.toString()).minus(payments._sum.amount?.toString() ?? 0);
      if (remaining.lte(0)) {
        if (dto.amount) throw new BadRequestException('Аренда за этот месяц уже оплачена');
        return;
      }
      const amount = dto.amount ? D(dto.amount) : remaining;
      if (amount.gt(remaining)) throw new BadRequestException(`Осталось получить ${remaining.toFixed(2)} ₽`);
      const rent = await tx.category.findUniqueOrThrow({ where: { systemKey: 'rent' } });
      await tx.transaction.create({
        data: {
          propertyId: lease.propertyId, leaseId: lease.id, categoryId: rent.id,
          type: 'INCOME', amount: amount.toFixed(2), date: new Date(dto.date ?? todayIso()),
          rentPeriod: dto.period, paymentKey: dto.paymentKey, source: 'LEASE_SCHEDULE',
        },
      });
    });
  }

  /** Отменяем последний платёж из формы, остальные поступления сохраняем. */
  async unmarkRent(ownerId: string, { leaseId, period }: RentMark) {
    const lease = await this.getLease(ownerId, leaseId);
    await this.prisma.$transaction(async (tx) => {
      await this.properties.lockOwned(tx, ownerId, lease.propertyId);
      const last = await tx.transaction.findFirst({
        where: { leaseId, rentPeriod: period, source: 'LEASE_SCHEDULE' },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      });
      if (!last) throw new BadRequestException('Платёж внесён вручную — измените его в «Финансах»');
      await tx.transaction.delete({ where: { id: last.id } });
    });
  }

  /**
   * Ближайшие события: свои (с развёрнутыми повторами), дни оплаты аренды, окончания договоров.
   * Невыполненное за последние 60 дней тоже попадает — как просроченное.
   */
  async upcoming(ownerId: string, q: UpcomingQuery): Promise<UpcomingItem[]> {
    const now = todayIso();
    const from = q.from ?? addDays(now, -OVERDUE_LOOKBACK_DAYS);
    const to = q.to ?? addDays(now, 30);
    const items: UpcomingItem[] = [];
    const mark = (date: string, done: boolean | null, remind: number) => {
      const overdue = done === false && date < now;
      return { overdue, attention: done === false && (overdue || addDays(date, -remind) <= now) };
    };

    const events = await this.prisma.event.findMany({
      where: { ownerId, ...(q.propertyId && { propertyId: q.propertyId }) },
      include: {
        property: { select: { title: true, status: true } },
        completions: { where: { occurrenceDate: { gte: new Date(from), lte: new Date(to) } } },
      },
    });
    for (const e of events) {
      if (e.property?.status === 'ARCHIVED') continue;
      const doneDates = new Set(e.completions.map((c) => iso(c.occurrenceDate)));
      for (const date of occurrences(iso(e.date), e.recurrence, from, to)) {
        const done = doneDates.has(date);
        items.push({
          key: `e:${e.id}:${date}`,
          source: 'EVENT',
          eventId: e.id,
          propertyId: e.propertyId,
          propertyTitle: e.property?.title ?? null,
          title: e.title,
          kind: e.kind,
          date,
          amount: e.amount?.toString() ?? null,
          done,
          recurrence: e.recurrence,
          ...mark(date, done, e.remindDaysBefore),
        });
      }
    }

    const leases = await this.prisma.lease.findMany({
      where: {
        property: { ownerId, status: { not: 'ARCHIVED' }, ...(q.propertyId && { id: q.propertyId }) },
        startDate: { lte: new Date(to) },
        // Долги по старым договорам не исчезают через 60 дней.
        ...(q.from && { OR: [{ endDate: null }, { endDate: { gte: new Date(from) } }] }),
      },
      include: {
        property: { select: { title: true } },
        tenant: { select: { fullName: true } },
        transactions: {
          // Оплатой аренды считается только статья «Арендная плата»: компенсация ЖКХ и прочие доходы
          // тоже привязаны к договору (для налога с юрлиц), но аренду не закрывают
          where: { ...RENT_INCOME, isPaid: true, rentPeriod: { lte: to.slice(0, 7) } },
          select: { rentPeriod: true, amount: true, source: true },
        },
      },
    });
    for (const l of leases) {
      const start = iso(l.startDate);
      const end = l.endDate ? iso(l.endDate) : null;
      const paidMonths = new Map<string, string[]>();
      for (const t of l.transactions) {
        if (!t.rentPeriod) continue;
        const amounts = paidMonths.get(t.rentPeriod) ?? [];
        amounts.push(t.amount.toString());
        paidMonths.set(t.rentPeriod, amounts);
      }
      // Договор, внесённый задним числом: платежи до месяца внесения не показываем, а в месяце внесения
      // не считаем просроченными — иначе новый пользователь сразу видит «просрочено» за прошлое
      const entered = iso(l.createdAt);
      // День оплаты каждого месяца в пределах договора
      const first = clampDate(Number(start.slice(0, 4)), Number(start.slice(5, 7)), l.paymentDay);
      const rentFrom = q.from ?? (entered.slice(0, 8) + '01');
      for (const scheduled of occurrences(first, 'MONTHLY', rentFrom, to)) {
        const date = scheduled < start ? start : scheduled;
        // После последнего дня договора платежей нет
        if (date < start.slice(0, 8) + '01' || (end && date > end) || date.slice(0, 7) < entered.slice(0, 7)) continue;
        const period = date.slice(0, 7);
        const balance = rentBalance(l.rentAmount.toString(), paidMonths.get(period) ?? []);
        const { done } = balance;
        if (date < from && done) continue;
        const flags = date < entered ? { overdue: false, attention: false } : mark(date, done, RENT_REMIND_DAYS);
        items.push({
          key: `r:${l.id}:${date.slice(0, 7)}`,
          source: 'RENT',
          leaseId: l.id,
          propertyId: l.propertyId,
          propertyTitle: l.property.title,
          title: `Аренда: ${l.tenant.fullName}`,
          kind: 'RENT',
          date,
          amount: l.rentAmount.toString(),
          period,
          ...balance,
          canUndoPayment: l.transactions.some((t) => t.rentPeriod === period && t.source === 'LEASE_SCHEDULE'),
          done,
          recurrence: 'MONTHLY',
          ...flags,
        });
      }
      if (end && end >= from && end <= to) {
        items.push({
          key: `l:${l.id}`,
          source: 'LEASE_END',
          leaseId: l.id,
          propertyId: l.propertyId,
          propertyTitle: l.property.title,
          title: `Окончание договора: ${l.tenant.fullName}`,
          kind: 'LEASE_END',
          date: end,
          amount: null,
          done: null,
          recurrence: 'NONE',
          overdue: false,
          attention: end >= now && addDays(end, -LEASE_END_REMIND_DAYS) <= now,
        });
      }
    }

    return items.sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title));
  }

  private async getOwned(ownerId: string, id: string) {
    const ev = await this.prisma.event.findFirst({ where: { id, ownerId } });
    if (!ev) throw new NotFoundException('Событие не найдено');
    return ev;
  }

  private async getLease(ownerId: string, id: string) {
    const lease = await this.prisma.lease.findFirst({ where: { id, property: { ownerId } } });
    if (!lease) throw new NotFoundException('Договор не найден');
    return lease;
  }
}
