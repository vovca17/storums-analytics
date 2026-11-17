import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '@storums/db';
import { addDays, todayIso } from '@storums/shared';
import { newUser } from './client';
import { TEST_DATABASE_URL } from './env';

const db = new PrismaClient({ datasourceUrl: TEST_DATABASE_URL });
afterAll(() => db.$disconnect());
const today = todayIso();
const period = today.slice(0, 7);
const monthsAgo = (n: number) => {
  const [y, m] = period.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1 - n, 1)).toISOString().slice(0, 7);
};

async function fixture() {
  const u = await newUser('rent-payments');
  const p = await u.post('/properties', { title: 'Платежи', address: 'г Москва, д 1', regionCode: '77', areaM2: '40' });
  const propertyId = p.body.id;
  const l = await u.post(`/properties/${propertyId}/leases`, {
    tenant: { fullName: 'Арендатор' }, startDate: `${monthsAgo(6)}-01`, rentAmount: '50000', paymentDay: 5,
  });
  expect(l.status).toBe(201);
  const leaseId = l.body.id;
  await db.lease.update({ where: { id: leaseId }, data: { createdAt: new Date(`${monthsAgo(6)}-01`) } });
  const cats = (await u.get('/categories')).body as Array<{ id: string; systemKey: string }>;
  const categoryId = cats.find(c => c.systemKey === 'rent')!.id;
  const items = async () => (await u.get(`/events/upcoming?propertyId=${propertyId}`)).body as any[];
  const item = async (month = period) => (await items()).find(i => i.source === 'RENT' && i.period === month)!;
  const payments = async () => (await u.get(`/transactions?propertyId=${propertyId}`)).body as any[];
  return { u, propertyId, leaseId, categoryId, item, payments };
}

describe('арендные платежи и задолженность', () => {
  it('часть оплаты оставляет остаток, повтор формы не создаёт доход дважды, отмена убирает только последний платёж', async () => {
    const f = await fixture();
    const payment = { leaseId: f.leaseId, period, amount: '15000', date: today, paymentKey: randomUUID() };
    const results = await Promise.all([f.u.post('/events/rent', payment), f.u.post('/events/rent', payment)]);
    expect(results.map(r => r.status)).toEqual([204, 204]);
    expect(await f.payments()).toHaveLength(1);
    expect(await f.item()).toMatchObject({ paidAmount: '15000.00', remainingAmount: '35000.00', done: false });
    expect((await f.u.post('/events/rent', { ...payment, amount: '15001' })).status).toBe(400);
    expect((await f.u.post('/events/rent', { ...payment, amount: '35001', paymentKey: randomUUID() })).status).toBe(400);

    // Две одновременные галочки добирают остаток только один раз.
    const rest = await Promise.all([f.u.post('/events/rent', { leaseId: f.leaseId, period }), f.u.post('/events/rent', { leaseId: f.leaseId, period })]);
    expect(rest.map(r => r.status)).toEqual([204, 204]);
    expect(await f.payments()).toHaveLength(2);
    expect(await f.item()).toMatchObject({ paidAmount: '50000.00', remainingAmount: '0.00', done: true });
    expect((await f.u.del(`/events/rent?leaseId=${f.leaseId}&period=${period}`)).status).toBe(204);
    expect(await f.item()).toMatchObject({ paidAmount: '15000.00', remainingAmount: '35000.00', done: false });
  });

  it('деньги сегодня за прошлый месяц закрывают прошлый месяц, аналитика учитывает дату поступления', async () => {
    const f = await fixture();
    const previous = monthsAgo(1);
    expect((await f.u.post('/events/rent', { leaseId: f.leaseId, period: previous })).status).toBe(204);
    expect(await f.item(previous)).toMatchObject({ done: true, paidAmount: '50000.00' });
    expect(await f.item()).toMatchObject({ done: false, remainingAmount: '50000.00' });
    expect((await f.payments())[0]).toMatchObject({ rentPeriod: previous, date: `${today}T00:00:00.000Z` });
    const stats = await f.u.get(`/analytics/monthly?propertyId=${f.propertyId}&from=${today}&to=${today}`);
    expect(stats.body.totals.income).toBe('50000.00');
  });

  it('ручные платежи суммируются, правка даты не переносит месяц аренды, переплата не становится отрицательным долгом', async () => {
    const f = await fixture();
    const previous = monthsAgo(1);
    const payment = await f.u.post('/transactions', {
      propertyId: f.propertyId, leaseId: f.leaseId, categoryId: f.categoryId,
      type: 'INCOME', amount: '20000', date: today, rentPeriod: previous,
    });
    expect(payment.status).toBe(201);
    expect(await f.item(previous)).toMatchObject({ remainingAmount: '30000.00', done: false });
    expect((await f.u.patch(`/transactions/${payment.body.id}`, { date: addDays(today, -1) })).status).toBe(200);
    expect((await f.u.get(`/transactions/${payment.body.id}`)).body.rentPeriod).toBe(previous);
    expect((await f.u.patch(`/transactions/${payment.body.id}`, { amount: '51000' })).status).toBe(200);
    expect(await f.item(previous)).toMatchObject({ remainingAmount: '0.00', overpaidAmount: '1000.00', done: true, canUndoPayment: false });
    expect((await f.u.del(`/events/rent?leaseId=${f.leaseId}&period=${previous}`)).status).toBe(400);
    expect((await f.u.del(`/transactions/${payment.body.id}`)).status).toBe(204);
    expect(await f.item(previous)).toMatchObject({ remainingAmount: '50000.00', done: false });
  });

  it('неоплаченный месяц не исчезает через 60 дней, чужой договор и недействующий месяц отклоняются', async () => {
    const f = await fixture();
    expect(await f.item(monthsAgo(4))).toMatchObject({ overdue: true, attention: true, remainingAmount: '50000.00' });
    const other = await newUser('other-rent');
    expect((await other.post('/events/rent', { leaseId: f.leaseId, period })).status).toBe(404);
    expect((await f.u.post('/events/rent', { leaseId: f.leaseId, period: monthsAgo(7) })).status).toBe(400);
    expect((await f.u.post('/events/rent', { leaseId: f.leaseId, period, amount: '1' })).status).toBe(400);
  });
});
