/**
 * События и повторы. Даты — строки "YYYY-MM-DD" (без часовых поясов).
 */
export type RecurrenceKind = 'NONE' | 'MONTHLY' | 'YEARLY';

export type EventKindName = 'CLEANING' | 'METER_READINGS' | 'PAYMENT' | 'REPAIR' | 'OTHER';

/** Системная статья расходов для операции, которую создаёт отметка «сделано». */
export function expenseCategoryKey(kind: EventKindName): string {
  if (kind === 'CLEANING') return 'cleaning';
  if (kind === 'REPAIR') return 'repair';
  if (kind === 'METER_READINGS') return 'utilities';
  return 'other_expense';
}

const pad = (n: number) => String(n).padStart(2, '0');
const daysIn = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate(); // m: 1..12

/** Дата с числом, урезанным до длины месяца: 31-е в феврале → 28/29. */
export function clampDate(y: number, m: number, d: number): string {
  return `${y}-${pad(m)}-${pad(Math.min(d, daysIn(y, m)))}`;
}

/** Все даты события в отрезке [from, to] включительно, не раньше первой даты события. */
export function occurrences(start: string, recurrence: RecurrenceKind, from: string, to: string): string[] {
  if (recurrence === 'NONE') return start >= from && start <= to ? [start] : [];
  const [sy, sm, sd] = start.split('-').map(Number) as [number, number, number];
  const [fy, fm] = from.split('-').map(Number) as [number, number];
  const out: string[] = [];
  let y = fy;
  let m = recurrence === 'YEARLY' ? sm : fm;
  for (let i = 0; i < 1200; i++) {
    const date = clampDate(y, m, sd);
    if (date > to) break;
    if (date >= from && date >= start) out.push(date);
    if (recurrence === 'MONTHLY') {
      m++;
      if (m > 12) {
        m = 1;
        y++;
      }
    } else {
      y++;
    }
  }
  // Если отрезок начался в том же году после даты повтора, первый годовой повтор отбросится выше
  return out;
}

/**
 * Часовой пояс, в котором кабинет считает «сегодня». Сервер (Vercel) живёт в UTC, браузер — где угодно;
 * без общего пояса с 00:00 до 03:00 по Москве «сегодня» на сервере и в форме расходились на день.
 */
export const APP_TIME_ZONE = 'Europe/Moscow';

/** Сегодня по Москве, "YYYY-MM-DD". */
export function todayIso(now = new Date()): string {
  return now.toLocaleDateString('sv-SE', { timeZone: APP_TIME_ZONE });
}

/** Сегодня по Москве как Date (полночь UTC) — для сравнения с датами в базе, которые хранятся так же. */
export function todayDate(now = new Date()): Date {
  return new Date(todayIso(now));
}

/** Разница в днях: b − a. */
export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}

export function addDays(date: string, n: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
}
