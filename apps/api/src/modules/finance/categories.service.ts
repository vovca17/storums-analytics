import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { CreateCategory } from '@storums/shared';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  /** Системные (ownerId = null) и свои статьи пользователя. */
  list(ownerId: string) {
    return this.prisma.category.findMany({
      where: { OR: [{ ownerId: null }, { ownerId }] },
      orderBy: [{ type: 'asc' }, { createdAt: 'asc' }],
      select: { id: true, name: true, type: true, parentId: true, icon: true, systemKey: true, ownerId: true },
    });
  }

  /** Статья, доступная пользователю (системная или своя), иначе 404. */
  async getVisible(ownerId: string, id: string) {
    const c = await this.prisma.category.findFirst({ where: { id, OR: [{ ownerId: null }, { ownerId }] } });
    if (!c) throw new NotFoundException('Статья не найдена');
    return c;
  }

  async create(ownerId: string, dto: CreateCategory) {
    if (dto.parentId) {
      const parent = await this.getVisible(ownerId, dto.parentId);
      if (parent.type !== dto.type) throw new ConflictException('Подстатья должна быть того же типа');
    }
    return this.prisma.category.create({ data: { ...dto, ownerId } });
  }

  /** Удалить можно только свою статью без операций. */
  async remove(ownerId: string, id: string) {
    const c = await this.prisma.category.findFirst({ where: { id, ownerId } });
    if (!c) throw new NotFoundException('Статья не найдена');
    const used = await this.prisma.transaction.count({ where: { categoryId: id } });
    if (used) throw new ConflictException('По статье есть операции — сначала перенесите их');
    await this.prisma.category.delete({ where: { id } });
  }
}
