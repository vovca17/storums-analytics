import { BadRequestException, PipeTransform } from '@nestjs/common';
import type { ZodType, ZodTypeDef } from 'zod';

/** Проверяет тело/query по zod-схеме из @storums/shared или модуля. */
export class ZodPipe<T> implements PipeTransform<unknown, T> {
  // Вход (Input) у схем с transform отличается от результата — проверяем только выход
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(private readonly schema: ZodType<T, ZodTypeDef, any>) {}

  transform(value: unknown): T {
    const r = this.schema.safeParse(value);
    if (!r.success) {
      throw new BadRequestException({ message: 'Ошибка валидации', issues: r.error.issues });
    }
    return r.data;
  }
}
