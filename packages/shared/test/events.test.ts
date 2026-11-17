import { describe, expect, it } from 'vitest';
import { addDays, CreateEvent, daysBetween, eventExpenseReady, expenseCategoryKey, occurrences, todayDate, todayIso, UpdateEvent } from '../src';

describe('occurrences', () => {
  it('разовое событие — только если попадает в отрезок', () => {
    expect(occurrences('2026-11-10', 'NONE', '2026-11-01', '2026-11-30')).toEqual(['2026-11-10']);
    expect(occurrences('2026-12-10', 'NONE', '2026-11-01', '2026-11-30')).toEqual([]);
  });

  it('ежемесячно: 31-е число урезается до конца месяца', () => {
    expect(occurrences('2026-01-31', 'MONTHLY', '2026-01-01', '2026-04-30')).toEqual([
      '2026-01-31',
      '2026-02-28',
      '2026-03-31',
      '2026-04-30',
    ]);
  });

  it('ежемесячно: не раньше первой даты события', () => {
    expect(occurrences('2026-11-20', 'MONTHLY', '2026-10-01', '2026-12-31')).toEqual(['2026-11-20', '2026-12-20']);
  });

  it('ежегодно', () => {
    expect(occurrences('2024-02-29', 'YEARLY', '2025-01-01', '2028-12-31')).toEqual([
      '2025-02-28',
      '2026-02-28',
      '2027-02-28',
      '2028-02-29',
    ]);
    expect(occurrences('2026-03-15', 'YEARLY', '2026-06-01', '2026-12-31')).toEqual([]);
  });

  it('дни между датами', () => {
    expect(daysBetween('2026-11-11', '2026-11-25')).toBe(14);
    expect(addDays('2026-12-30', 3)).toBe('2027-01-02');
  });
});

describe('todayIso', () => {
  it('считает день по Москве, а не по UTC сервера', () => {
    // 22:30 UTC 11 ноября = 01:30 12 ноября по Москве
    expect(todayIso(new Date('2026-11-11T22:30:00Z'))).toBe('2026-11-12');
    expect(todayIso(new Date('2026-11-11T20:30:00Z'))).toBe('2026-11-11');
    expect(todayDate(new Date('2026-11-11T22:30:00Z')).toISOString()).toBe('2026-11-12T00:00:00.000Z');
  });
});

describe('учёт события в расходах', () => {
  const base = { title: 'Уборка', date: '2026-11-20', countAsExpense: true };
  it('без квартиры и суммы — ошибка на countAsExpense', () => {
    const r = CreateEvent.safeParse(base);
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0]).toMatchObject({ path: ['countAsExpense'], message: 'Выберите квартиру и укажите сумму' });
  });
  it('с квартирой и суммой — успех', () => {
    expect(CreateEvent.safeParse({ ...base, propertyId: '3f2b8c1e-5a4d-4e7b-9c1a-2d3e4f5a6b7c', amount: '1500' }).success).toBe(true);
  });
  it('по умолчанию выключено; в UpdateEvent поле не сбрасывается', () => {
    expect(CreateEvent.parse({ title: 'x', date: '2026-11-20' }).countAsExpense).toBe(false);
    expect(UpdateEvent.parse({ title: 'x' })).not.toHaveProperty('countAsExpense');
  });
  it('статья расхода по виду события', () => {
    expect(expenseCategoryKey('CLEANING')).toBe('cleaning');
    expect(expenseCategoryKey('REPAIR')).toBe('repair');
    expect(expenseCategoryKey('METER_READINGS')).toBe('utilities');
    expect(expenseCategoryKey('PAYMENT')).toBe('other_expense');
  });
});

describe('eventExpenseReady', () => {
  it('нужны квартира и сумма больше нуля', () => {
    expect(eventExpenseReady('p1', '1500.00')).toBe(true);
    expect(eventExpenseReady('p1', '0.01')).toBe(true);
  });

  it('без квартиры, пустая, нулевая или некорректная сумма — нет', () => {
    expect(eventExpenseReady(null, '100')).toBe(false);
    expect(eventExpenseReady('', '100')).toBe(false);
    expect(eventExpenseReady('p1', null)).toBe(false);
    expect(eventExpenseReady('p1', undefined)).toBe(false);
    expect(eventExpenseReady('p1', '')).toBe(false);
    expect(eventExpenseReady('p1', '0')).toBe(false);
    expect(eventExpenseReady('p1', '0.00')).toBe(false);
    expect(eventExpenseReady('p1', 'abc')).toBe(false);
  });
});
