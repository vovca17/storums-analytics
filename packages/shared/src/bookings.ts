/**
 * Посуточная аренда. Ночь — дата заезда; день выезда свободен.
 * Даты — строки "YYYY-MM-DD".
 */
import { addDays, daysBetween } from './events';

export interface Stay {
  checkIn: string;
  checkOut: string;
}

/** Пересекаются ли две брони (выезд одного в день заезда другого — можно). */
export const staysOverlap = (a: Stay, b: Stay) => a.checkIn < b.checkOut && b.checkIn < a.checkOut;

/** Ночей в брони. */
export const nights = (s: Stay) => Math.max(0, daysBetween(s.checkIn, s.checkOut));

/** Ночей брони, попадающих в отрезок [from, to] (обе даты — ночи, включительно). */
export function nightsWithin(s: Stay, from: string, to: string): number {
  const start = s.checkIn > from ? s.checkIn : from;
  const endExclusive = s.checkOut < addDays(to, 1) ? s.checkOut : addDays(to, 1);
  return Math.max(0, daysBetween(start, endExclusive));
}

/** Все занятые ночи в отрезке — для календаря. */
export function bookedNights(stays: Stay[], from: string, to: string): Set<string> {
  const out = new Set<string>();
  for (const s of stays) {
    for (let d = s.checkIn > from ? s.checkIn : from; d < s.checkOut && d <= to; d = addDays(d, 1)) out.add(d);
  }
  return out;
}
