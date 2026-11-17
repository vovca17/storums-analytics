import { Injectable, Logger } from '@nestjs/common';
import { todayDate } from '@storums/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { PropertiesService } from '../properties/properties.service';

@Injectable()
export class CronService {
  private readonly log = new Logger(CronService.name);

  constructor(private readonly prisma: PrismaService, private readonly properties: PropertiesService) {}

  /** Ежедневные задачи. Возвращает, что сделано, — видно в логах Vercel. */
  async daily(now = new Date()) {
    const result = await this.syncLeases(now);
    this.log.log(`daily: свободны — ${result.vacated}, сдаются — ${result.activated}`);
    return result;
  }

  /**
   * «Сдаётся», но действующего договора нет, а прошлый уже закончился → «Свободна».
   * Посуточные квартиры не трогаем: у них нет договоров.
   */
  private async syncLeases(now: Date) {
    const today = todayDate(now);
    const candidates = await this.prisma.property.findMany({
      where: {
        status: { in: ['RENTED', 'VACANT'] },
        dailyRent: false,
        leases: { some: {} },
      },
      select: { id: true, ownerId: true },
    });
    let vacated = 0;
    let activated = 0;
    for (const p of candidates) {
      await this.prisma.$transaction(async (tx) => {
        const before = await this.properties.lockOwned(tx, p.ownerId, p.id);
        const after = await this.properties.syncLeaseStatus(tx, p.id, today);
        if (before.status !== after.status) {
          if (after.status === 'VACANT') vacated++;
          if (after.status === 'RENTED') activated++;
        }
      });
    }
    return { vacated, activated };
  }
}
