import { z } from 'zod';

/** Откуда пользователь оставил почту в список ожидания. */
export const WAITLIST_SOURCES = ['landing', 'login', 'forgot'] as const;
export type WaitlistSource = (typeof WAITLIST_SOURCES)[number];

export const JoinWaitlist = z.object({
  email: z.string().trim().toLowerCase().email('Введите корректную почту').max(254),
  source: z.enum(WAITLIST_SOURCES),
});
export type JoinWaitlist = z.infer<typeof JoinWaitlist>;

export interface WaitlistEntryDto {
  email: string;
  source: WaitlistSource;
  /** ISO-время создания. */
  createdAt: string;
}

const moscowFormat = new Intl.DateTimeFormat('ru-RU', {
  timeZone: 'Europe/Moscow',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

/** ISO-время → `дд.мм.гггг чч:мм` по Москве. */
export function formatMoscowDateTime(iso: string): string {
  const p: Record<string, string> = {};
  for (const part of moscowFormat.formatToParts(new Date(iso))) p[part.type] = part.value;
  return `${p.day}.${p.month}.${p.year} ${p.hour}:${p.minute}`;
}

/** Ячейка CSV: защита от формул Excel и экранирование `;`, кавычек, переводов строк. */
function csvCell(value: string): string {
  const safe = /^[=+\-@]/.test(value) ? `'${value}` : value;
  return /[;"\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/** CSV для Excel: BOM, разделитель `;`, строки через CRLF. */
export function waitlistCsv(entries: WaitlistEntryDto[]): string {
  const rows = entries.map((e) =>
    [csvCell(e.email), csvCell(e.source), csvCell(formatMoscowDateTime(e.createdAt))].join(';'),
  );
  return '﻿' + ['email;source;created_at', ...rows].join('\r\n');
}
