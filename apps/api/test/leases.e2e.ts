import { describe, expect, it } from 'vitest';
import { newUser } from './client';

/** Дата через n дней от сегодня (UTC), YYYY-MM-DD. */
const day = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
const today = day(0);

type Item = { source: string; leaseId?: string; date: string; done: boolean | null; overdue: boolean; attention: boolean };

async function withLease(name: string, lease: Record<string, unknown>) {
  const u = await newUser(name);
  const p = await u.post('/properties', { title: name, address: 'г Москва, д 1', regionCode: '77', areaM2: '40' });
  const l = await u.post(`/properties/${p.body.id}/leases`, { tenant: { fullName: 'Тест Арендатор' }, rentAmount: '50000', ...lease });
  expect(l.status, JSON.stringify(l.body)).toBe(201);
  const cats = (await u.get('/categories')).body as Array<{ id: string; systemKey: string | null }>;
  const cat = (key: string) => cats.find((c) => c.systemKey === key)!.id;
  const rent = async (query = '') =>
    ((await u.get(`/events/upcoming?propertyId=${p.body.id}${query}`)).body as Item[]).filter((i) => i.source === 'RENT');
  return { u, propertyId: p.body.id as string, leaseId: l.body.id as string, cat, rent };
}

describe('дни оплаты аренды', () => {
  it('оплату закрывает только «Арендная плата», а не любой доход по договору', async () => {
    const { u, propertyId, leaseId, cat, rent } = await withLease('rent-cat', { startDate: today, paymentDay: 28 });
    const item = (await rent())[0]!;
    expect(item.done).toBe(false);
    const income = (categoryId: string, amount = '3000') =>
      u.post('/transactions', { propertyId, leaseId, categoryId, type: 'INCOME', amount, date: item.date });

    expect((await income(cat('utilities_compensation'))).status).toBe(201);
    expect((await rent())[0]!.done).toBe(false);

    expect((await income(cat('rent'))).status).toBe(201);
    expect((await rent())[0]!.done).toBe(false);
    expect((await income(cat('rent'), '47000')).status).toBe(201);
    expect((await rent())[0]!.done).toBe(true);
  });

  it('после последнего дня договора платежей нет', async () => {
    // Конец договора — число не больше 27, а день оплаты на день позже: в последнем месяце платить уже не нужно
    const end = Number(day(45).slice(8)) <= 27 ? day(45) : day(50);
    const { rent } = await withLease('rent-end', {
      startDate: today,
      endDate: end,
      paymentDay: Number(end.slice(8)) + 1,
    });
    const items = await rent(`&from=${today}&to=${day(80)}`);
    expect(items.length).toBeGreaterThan(0);
    expect(items.every((i) => i.date <= end)).toBe(true);
  });

  it('договор, внесённый задним числом, не показывает прошлые месяцы просроченными', async () => {
    const { rent } = await withLease('rent-backdated', { startDate: day(-100), paymentDay: 1 });
    const items = await rent();
    expect(items.length).toBeGreaterThan(0);
    expect(items.every((i) => i.date.slice(0, 7) >= today.slice(0, 7))).toBe(true);
    expect(items.some((i) => i.overdue || (i.attention && i.date < today))).toBe(false);
  });
});

describe('архив квартир', () => {
  it('архив закрывает договор, квартира видна в архиве и возвращается из него', async () => {
    const { u, propertyId, rent } = await withLease('archive', { startDate: day(-10), paymentDay: 28 });
    expect((await u.del(`/properties/${propertyId}`)).status).toBe(200);

    expect(((await u.get('/properties')).body as Array<{ id: string }>).some((p) => p.id === propertyId)).toBe(false);
    const archived = (await u.get('/properties?archived=true')).body as Array<{ id: string }>;
    expect(archived.map((p) => p.id)).toEqual([propertyId]);
    expect(await rent()).toEqual([]);

    const restored = await u.patch(`/properties/${propertyId}`, { status: 'VACANT' });
    expect(restored.status).toBe(200);
    const p = (await u.get(`/properties/${propertyId}`)).body;
    expect(p.status).toBe('VACANT');
    // Договор закончился днём архивации — будущих платежей нет
    expect(p.leases[0].endDate.slice(0, 10)).toBe(today);
    expect((await rent()).every((i) => i.date <= today)).toBe(true);
    expect((await u.get('/properties?archived=true')).body).toEqual([]);
  });
});
