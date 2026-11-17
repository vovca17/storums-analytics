import { describe, expect, it } from 'vitest';
import { bookedNights, CreateBooking, nights, nightsWithin, staysOverlap } from '../src';

describe('брони', () => {
  const a = { checkIn: '2026-11-10', checkOut: '2026-11-13' };
  it('выезд в день заезда следующего — не пересечение', () => {
    expect(staysOverlap(a, { checkIn: '2026-11-13', checkOut: '2026-11-15' })).toBe(false);
    expect(staysOverlap(a, { checkIn: '2026-11-12', checkOut: '2026-11-15' })).toBe(true);
    expect(staysOverlap(a, { checkIn: '2026-11-01', checkOut: '2026-11-30' })).toBe(true);
  });
  it('ночи', () => {
    expect(nights(a)).toBe(3);
    // бронь через границу месяца
    const b = { checkIn: '2026-11-29', checkOut: '2026-12-03' };
    expect(nightsWithin(b, '2026-11-01', '2026-11-30')).toBe(2);
    expect(nightsWithin(b, '2026-12-01', '2026-12-31')).toBe(2);
    expect([...bookedNights([a, b], '2026-11-01', '2026-11-30')]).toEqual([
      '2026-11-10', '2026-11-11', '2026-11-12', '2026-11-29', '2026-11-30',
    ]);
  });
  it('выезд раньше заезда — ошибка', () => {
    const r = CreateBooking.safeParse({ guestName: 'Анна', checkIn: '2026-11-10', checkOut: '2026-11-10', amount: '5000' });
    expect(r.success).toBe(false);
  });
});
