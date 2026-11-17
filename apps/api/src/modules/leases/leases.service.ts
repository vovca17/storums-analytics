import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { type CreateLease, type EndLease, type UpdateLease } from '@storums/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { PropertiesService } from '../properties/properties.service';

const DAY = 24 * 60 * 60 * 1000;
const ru = (d: Date) => d.toLocaleDateString('ru-RU', { timeZone: 'UTC' });

@Injectable()
export class LeasesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly properties: PropertiesService,
  ) {}

  /**
   * Новый арендатор + договор; квартира становится «Сдаётся». Всё в одной транзакции.
   * Текущий договор, если он ещё идёт, закрывается днём раньше начала нового — так меняется арендатор.
   */
  async create(ownerId: string, propertyId: string, dto: CreateLease) {
    await this.properties.getOwned(ownerId, propertyId);
    const { tenant, startDate, endDate, ...rest } = dto;
    const start = new Date(startDate);
    return this.prisma.$transaction(async (tx) => {
      const property = await this.properties.lockOwned(tx, ownerId, propertyId);
      if (property.status === 'ARCHIVED') throw new BadRequestException('Сначала верните квартиру из архива');
      const overlapping = await tx.lease.findMany({
        where: { propertyId, OR: [{ endDate: null }, { endDate: { gte: start } }] },
      });
      for (const l of overlapping) {
        if (l.startDate >= start) {
          throw new BadRequestException(
            `Уже есть договор с ${ru(l.startDate)} — новый должен начинаться позже`,
          );
        }
        await tx.lease.update({ where: { id: l.id }, data: { endDate: new Date(start.getTime() - DAY) } });
      }
      const t = await tx.tenant.create({ data: { ...tenant, ownerId } });
      const lease = await tx.lease.create({
        data: {
          ...rest,
          propertyId,
          tenantId: t.id,
          startDate: start,
          ...(endDate && { endDate: new Date(endDate) }),
        },
        include: { tenant: true },
      });
      await this.properties.syncLeaseStatus(tx, propertyId);
      return lease;
    });
  }

  /** Меняет условия договора и контакты арендатора. */
  async update(ownerId: string, propertyId: string, id: string, dto: UpdateLease) {
    await this.properties.getOwned(ownerId, propertyId);
    return this.prisma.$transaction(async (tx) => {
      await this.properties.lockOwned(tx, ownerId, propertyId);
      const lease = await tx.lease.findFirst({ where: { id, propertyId } });
      if (!lease) throw new NotFoundException('Договор не найден');
      const { tenant, startDate, endDate, ...rest } = dto;
      const start = startDate ? new Date(startDate) : lease.startDate;
      const end = endDate === undefined ? lease.endDate : endDate ? new Date(endDate) : null;
      if (end && end < start) throw new BadRequestException('Окончание не может быть раньше начала');
      const clash = await tx.lease.findFirst({
        where: {
          propertyId, id: { not: id },
          ...(end && { startDate: { lte: end } }),
          OR: [{ endDate: null }, { endDate: { gte: start } }],
        },
      });
      if (clash) throw new BadRequestException(`Даты пересекаются с договором от ${ru(clash.startDate)}`);
      if (tenant && Object.keys(tenant).length) {
        await tx.tenant.update({ where: { id: lease.tenantId }, data: tenant });
      }
      const updated = await tx.lease.update({
        where: { id },
        data: {
          ...rest,
          ...(startDate && { startDate: start }),
          ...(endDate !== undefined && { endDate: end }),
        },
        include: { tenant: true },
      });
      await this.properties.syncLeaseStatus(tx, propertyId);
      return updated;
    });
  }

  /** Последний день включён; статус определяется всеми действующими договорами квартиры. */
  async end(ownerId: string, propertyId: string, id: string, dto: EndLease) {
    return this.update(ownerId, propertyId, id, { endDate: dto.endDate });
  }
}
