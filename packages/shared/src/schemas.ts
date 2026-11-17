import { z } from 'zod';
import { D } from './money';

/** Денежное поле из формы: число или строка "1234.5", не больше 2 знаков после точки. */
export const MoneyField = z
  .union([z.number(), z.string()])
  .transform((v) => String(v).replace(',', '.').trim())
  .refine((v) => /^\d{1,12}(\.\d{1,2})?$/.test(v), 'Введите число, не больше 2 знаков после запятой');

export const Mortgage = z.object({
  principal: MoneyField,
  ratePct: z.number().min(0).max(100),
  monthlyPayment: MoneyField,
  endDate: z.string().date().optional(),
});

export const PropertyStatus = z.enum(['RENTED', 'VACANT', 'RENOVATION', 'ARCHIVED']);

export const CreateProperty = z.object({
  title: z.string().trim().min(1).max(100),
  address: z.string().trim().min(3).max(300),
  regionCode: z.string().regex(/^\d{2,3}$/, 'Код региона: 2–3 цифры'),
  areaM2: MoneyField,
  residents: z.number().int().min(0).max(50).default(1),
  purchasePrice: MoneyField.optional(),
  purchaseDate: z.string().date().optional(),
  status: PropertyStatus.default('VACANT'),
  mortgage: Mortgage.optional(),
  dailyRent: z.boolean().default(false),
});
export type CreateProperty = z.infer<typeof CreateProperty>;

/** null — очистить поле: ипотеку погасили, цену или дату покупки стёрли. */
export const UpdateProperty = CreateProperty.partial().extend({
  mortgage: Mortgage.nullable().optional(),
  purchasePrice: MoneyField.nullable().optional(),
  purchaseDate: z.string().date().nullable().optional(),
});
export type UpdateProperty = z.infer<typeof UpdateProperty>;

export const CreateTenant = z.object({
  fullName: z.string().trim().min(2, 'Укажите имя').max(150),
  phone: z.string().trim().max(30).optional(),
  email: z.string().trim().email('Неверный email').optional(),
  isLegalEntity: z.boolean().default(false),
});
export type CreateTenant = z.infer<typeof CreateTenant>;

export const CreateLease = z
  .object({
    tenant: CreateTenant,
    startDate: z.string().date('Укажите дату'),
    endDate: z.string().date().optional(),
    rentAmount: MoneyField,
    paymentDay: z.number().int().min(1, 'От 1 до 28').max(28, 'От 1 до 28').default(1),
    deposit: MoneyField.optional(),
    utilitiesPaidBy: z.enum(['OWNER', 'TENANT', 'SPLIT']).default('OWNER'),
  })
  .refine((l) => !l.endDate || l.endDate > l.startDate, {
    message: 'Окончание позже начала',
    path: ['endDate'],
  });
export type CreateLease = z.infer<typeof CreateLease>;

/** Правка договора: меняются условия (цена, день оплаты, залог…) и контакты арендатора. null — очистить поле. */
export const UpdateLease = z.object({
  tenant: z
    .object({
      fullName: z.string().trim().min(2, 'Укажите имя').max(150).optional(),
      phone: z.string().trim().max(30).nullable().optional(),
      email: z.string().trim().email('Неверный email').nullable().optional(),
      isLegalEntity: z.boolean().optional(),
    })
    .optional(),
  startDate: z.string().date('Укажите дату').optional(),
  endDate: z.string().date('Неверная дата').nullable().optional(),
  rentAmount: MoneyField.optional(),
  paymentDay: z.number().int().min(1, 'От 1 до 28').max(28, 'От 1 до 28').optional(),
  deposit: MoneyField.nullable().optional(),
  utilitiesPaidBy: z.enum(['OWNER', 'TENANT', 'SPLIT']).optional(),
});
export type UpdateLease = z.infer<typeof UpdateLease>;

/** Досрочное или плановое завершение аренды: последний день договора. */
export const EndLease = z.object({ endDate: z.string().date('Укажите дату') });
export type EndLease = z.infer<typeof EndLease>;

/* ── Доходы и расходы ───────────────────────────── */

export const TransactionKind = z.enum(['INCOME', 'EXPENSE']);
export const RentPeriod = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Выберите месяц аренды');


/** Комментарий: вырезаем NUL и прочие управляющие символы (кроме \n и \t) — Postgres отвергает 0x00 с ошибкой 500. */
const CommentText = z
  .string()
  .transform((s) => s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, ''))
  .pipe(z.string().trim().max(500));

export const CreateTransaction = z.object({
  propertyId: z.string().uuid('Выберите квартиру'),
  categoryId: z.string().uuid('Выберите статью'),
  type: TransactionKind,
  amount: MoneyField.refine((v) => Number(v) > 0, 'Сумма больше нуля'),
  date: z.string().date('Неверная дата, формат дд.мм.гггг'),
  comment: CommentText.optional(),
  leaseId: z.string().uuid().optional(),
  rentPeriod: RentPeriod.optional(),
});
export type CreateTransaction = z.infer<typeof CreateTransaction>;

/** comment: null — очистить. Квартиру и тип операции не меняем: проще удалить и внести заново. */
export const UpdateTransaction = z.object({
  rentPeriod: RentPeriod.nullable().optional(),
  categoryId: z.string().uuid('Выберите статью').optional(),
  amount: MoneyField.refine((v) => Number(v) > 0, 'Сумма больше нуля').optional(),
  date: z.string().date('Неверная дата, формат дд.мм.гггг').optional(),
  comment: CommentText.nullable().optional(),
});
export type UpdateTransaction = z.infer<typeof UpdateTransaction>;

/** Список квартир в query — через запятую: ?propertyId=a,b */
const UuidList = z
  .string()
  .transform((s) => s.split(',').filter(Boolean))
  .pipe(z.array(z.string().uuid()).max(100));

/** Фильтры списка операций и аналитики (query-параметры). Даты включительно. */
export const TransactionQuery = z.object({
  propertyId: UuidList.optional(),
  categoryId: z.string().uuid().optional(),
  type: TransactionKind.optional(),
  from: z.string().date().optional(),
  to: z.string().date().optional(),
  limit: z.coerce.number().int().min(1).max(1000).optional(),
});
export type TransactionQuery = z.infer<typeof TransactionQuery>;

export const TaxQuery = z.object({ year: z.coerce.number().int().min(2000).max(2100) });
export type TaxQuery = z.infer<typeof TaxQuery>;

export const CreateCategory = z.object({
  name: z.string().trim().min(1, 'Укажите название').max(60),
  type: TransactionKind,
  parentId: z.string().uuid().optional(),
});
export type CreateCategory = z.infer<typeof CreateCategory>;

/* ── События и напоминания ───────────────────────── */

export const EventKind = z.enum(['CLEANING', 'METER_READINGS', 'PAYMENT', 'REPAIR', 'OTHER']);
export const Recurrence = z.enum(['NONE', 'MONTHLY', 'YEARLY']);

const EventBase = z.object({
  title: z.string().trim().min(1, 'Укажите, что нужно сделать').max(120),
  propertyId: z.string().uuid().optional(),
  kind: EventKind.default('OTHER'),
  date: z.string().date('Неверная дата, формат дд.мм.гггг'),
  recurrence: Recurrence.default('NONE'),
  remindDaysBefore: z.number().int().min(0, 'От 0 до 60').max(60, 'От 0 до 60').default(1),
  amount: MoneyField.optional(),
  comment: CommentText.optional(),
});

/** Расход по событию возможен, только если выбрана квартира и сумма больше нуля. */
export function eventExpenseReady(propertyId: string | null | undefined, amount: string | null | undefined): boolean {
  if (!propertyId || !amount) return false;
  try {
    return D(amount).gt(0);
  } catch {
    return false;
  }
}

export const EVENT_EXPENSE_NEEDS = 'Выберите квартиру и укажите сумму';

export const CreateEvent = EventBase.extend({
  /** Отметка «сделано» создаёт расход на сумму события */
  countAsExpense: z.boolean().default(false),
}).superRefine((v, ctx) => {
  if (v.countAsExpense && !eventExpenseReady(v.propertyId, v.amount)) {
    ctx.addIssue({ code: 'custom', path: ['countAsExpense'], message: EVENT_EXPENSE_NEEDS });
  }
});
export type CreateEvent = z.infer<typeof CreateEvent>;

/** Без default у countAsExpense: PATCH без поля не сбрасывает галочку. Проверка «квартира+сумма» — в сервисе. */
export const UpdateEvent = EventBase.partial().extend({
  propertyId: z.string().uuid().nullable().optional(),
  amount: MoneyField.nullable().optional(),
  comment: CommentText.nullable().optional(),
  countAsExpense: z.boolean().optional(),
});
export type UpdateEvent = z.infer<typeof UpdateEvent>;

export const UpcomingQuery = z.object({
  from: z.string().date().optional(),
  to: z.string().date().optional(),
  propertyId: z.string().uuid().optional(),
});
export type UpcomingQuery = z.infer<typeof UpcomingQuery>;

/** Отметка конкретного повтора: дата повтора */
export const CompleteEvent = z.object({ date: z.string().date() });
export type CompleteEvent = z.infer<typeof CompleteEvent>;

/** Аренда за месяц получена / снять отметку */
export const RentMark = z.object({ leaseId: z.string().uuid(), period: RentPeriod });
export type RentMark = z.infer<typeof RentMark>;

/** Без суммы — получить весь остаток; с суммой — частичный платёж с защитой от повторной отправки. */
export const RentPayment = RentMark.extend({
  amount: MoneyField.refine((v) => Number(v) > 0, 'Сумма больше нуля').optional(),
  date: z.string().date('Укажите дату поступления').optional(),
  paymentKey: z.string().uuid().optional(),
}).refine((v) => !v.amount || v.paymentKey, { message: 'Обновите форму платежа', path: ['paymentKey'] });
export type RentPayment = z.infer<typeof RentPayment>;

/* ── Посуточная аренда ───────────────────────────── */

export const BookingPlatform = z.enum(['DIRECT', 'AVITO', 'SUTOCHNO', 'OSTROVOK', 'YANDEX', 'OTHER']);

const BookingBase = z.object({
  guestName: z.string().trim().min(1, 'Укажите гостя').max(150),
  guestPhone: z.string().trim().max(30).optional(),
  checkIn: z.string().date('Неверная дата, формат дд.мм.гггг'),
  checkOut: z.string().date('Неверная дата, формат дд.мм.гггг'),
  amount: MoneyField,
  cleaningFee: MoneyField.optional(),
  commission: MoneyField.optional(),
  platform: BookingPlatform.default('DIRECT'),
  isPaid: z.boolean().default(false),
  comment: CommentText.optional(),
});

export const CreateBooking = BookingBase.refine((b) => b.checkOut > b.checkIn, {
  message: 'Выезд позже заезда',
  path: ['checkOut'],
});
export type CreateBooking = z.infer<typeof CreateBooking>;

/** Правка брони; null — очистить необязательное поле. */
export const UpdateBooking = BookingBase.partial().extend({
  guestPhone: z.string().trim().max(30).nullable().optional(),
  cleaningFee: MoneyField.nullable().optional(),
  commission: MoneyField.nullable().optional(),
  comment: CommentText.nullable().optional(),
});
export type UpdateBooking = z.infer<typeof UpdateBooking>;

export const BookingQuery = z.object({ from: z.string().date().optional(), to: z.string().date().optional() });
export type BookingQuery = z.infer<typeof BookingQuery>;
