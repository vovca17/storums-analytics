import { beforeAll, describe, expect, it } from 'vitest';
import { client, newUser } from './client';
import { BASE, INTERNAL } from './env';

/**
 * Изоляция данных: пользователь B не видит и не может менять ничего, что принадлежит A.
 * Каждый новый модуль API с данными пользователя должен попасть сюда.
 */
describe('изоляция данных между пользователями', () => {
  let A: Awaited<ReturnType<typeof newUser>>;
  let B: Awaited<ReturnType<typeof newUser>>;
  const ids: Record<string, string> = {};

  beforeAll(async () => {
    A = await newUser('a');
    B = await newUser('b');
    const p = await A.post('/properties', { title: 'Квартира A', address: 'г Москва, д 1', regionCode: '77', areaM2: '40', dailyRent: true });
    expect(p.status).toBe(201);
    ids.property = p.body.id;
    const lease = await A.post(`/properties/${ids.property}/leases`, {
      tenant: { fullName: 'Арендатор A' }, startDate: '2026-01-01', rentAmount: '50000', paymentDay: 5,
    });
    expect(lease.status).toBe(201);
    ids.lease = lease.body.id;
    const cats = (await A.get('/categories')).body as Array<{ id: string; systemKey: string | null }>;
    ids.rentCat = cats.find((c) => c.systemKey === 'rent')!.id;
    const own = await A.post('/categories', { name: 'Своя статья A', type: 'EXPENSE' });
    ids.ownCat = own.body.id;
    const tx = await A.post('/transactions', { propertyId: ids.property, categoryId: ids.rentCat, type: 'INCOME', amount: '50000', date: '2026-11-05', leaseId: ids.lease });
    expect(tx.status).toBe(201);
    ids.tx = tx.body.id;
    const ev = await A.post('/events', { title: 'Клининг A', propertyId: ids.property, date: '2026-11-20', kind: 'CLEANING', amount: '1500', countAsExpense: true });
    ids.event = ev.body.id;
    const bk = await A.post(`/properties/${ids.property}/bookings`, { guestName: 'Гость A', checkIn: '2026-12-01', checkOut: '2026-12-03', amount: '6000' });
    expect(bk.status).toBe(201);
    ids.booking = bk.body.id;
  });

  it('списки B пустые', async () => {
    expect((await B.get('/properties')).body).toEqual([]);
    expect((await B.get('/properties?archived=true')).body).toEqual([]);
    expect((await B.get('/transactions')).body).toEqual([]);
    expect((await B.get('/events')).body).toEqual([]);
    expect((await B.get('/events/upcoming')).body).toEqual([]);
    expect((await B.get('/analytics/monthly')).body.count).toBe(0);
    expect((await B.get('/analytics/tax?year=2026')).body.income).toBe('0.00');
    expect((await B.get('/analytics/yield')).body.properties).toEqual([]);
    const cats = (await B.get('/categories')).body as Array<{ name: string }>;
    expect(cats.some((c) => c.name === 'Своя статья A')).toBe(false);
  });

  it('проверку регистрации посторонний вызвать не может, а с секретом web она отдаёт только наличие почты', async () => {
    // Без служебного секрета — как будто эндпоинта нет
    expect((await client().post('/auth/email-exists', { email: A.email })).status).toBe(404);
    const res = await fetch(`${BASE}/auth/email-exists`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Internal-Secret': INTERNAL },
      body: JSON.stringify({ email: A.email }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ exists: true });
    expect((await client().get('/me')).status).toBe(401);
  });

  it('чтение чужого — 404', async () => {
    for (const path of [
      `/properties/${ids.property}`,
      `/transactions/${ids.tx}`,
      `/properties/${ids.property}/bookings`,
      `/properties/${ids.property}/bookings/${ids.booking}`,
    ]) {
      expect((await B.get(path)).status, path).toBe(404);
    }
  });

  it('изменение и удаление чужого — 404, данные A не тронуты', async () => {
    const txBefore = (await A.get('/transactions')).body.length;
    const attempts = [
      B.patch(`/properties/${ids.property}`, { title: 'взлом' }),
      B.del(`/properties/${ids.property}`),
      B.patch(`/properties/${ids.property}/leases/${ids.lease}`, { rentAmount: '1' }),
      B.post(`/properties/${ids.property}/leases/${ids.lease}/end`, { endDate: '2026-11-30' }),
      B.post(`/properties/${ids.property}/leases`, { tenant: { fullName: 'Чужой' }, startDate: '2026-12-01', rentAmount: '1' }),
      B.patch(`/transactions/${ids.tx}`, { amount: '1' }),
      B.del(`/transactions/${ids.tx}`),
      B.post('/transactions', { propertyId: ids.property, categoryId: ids.rentCat, type: 'INCOME', amount: '1', date: '2026-11-01' }),
      B.del(`/categories/${ids.ownCat}`),
      B.patch(`/events/${ids.event}`, { title: 'взлом' }),
      B.del(`/events/${ids.event}`),
      B.post(`/events/${ids.event}/complete`, { date: '2026-11-20' }),
      B.post('/events', { title: 'на чужую квартиру', propertyId: ids.property, date: '2026-11-20' }),
      B.post('/events/rent', { leaseId: ids.lease, period: '2026-11' }),
      B.patch(`/properties/${ids.property}/bookings/${ids.booking}`, { amount: '1' }),
      B.del(`/properties/${ids.property}/bookings/${ids.booking}`),
      B.post(`/properties/${ids.property}/bookings`, { guestName: 'Чужой', checkIn: '2027-01-01', checkOut: '2027-01-02', amount: '1' }),
    ];
    for (const r of await Promise.all(attempts)) expect(r.status).toBe(404);

    expect((await A.get(`/properties/${ids.property}`)).body.title).toBe('Квартира A');
    expect((await A.get(`/transactions/${ids.tx}`)).body.amount).toBe('50000.00');
    expect((await A.get('/events')).body).toHaveLength(1);
    // отметка события чужим пользователем не создала расход
    expect((await A.get('/transactions')).body).toHaveLength(txBefore);
    expect((await A.get(`/properties/${ids.property}/bookings`)).body).toHaveLength(1);
  });

  it('статья B не подходит для операции A и наоборот', async () => {
    const bCat = await B.post('/categories', { name: 'Своя статья B', type: 'EXPENSE' });
    const r = await A.post('/transactions', { propertyId: ids.property, categoryId: bCat.body.id, type: 'EXPENSE', amount: '1', date: '2026-11-01' });
    expect(r.status).toBe(404);
  });

  it('удаление аккаунта B не задевает A', async () => {
    expect((await B.del('/me')).status).toBe(204);
    expect((await A.get('/properties')).body).toHaveLength(1);
    expect((await A.get('/transactions')).body.length).toBeGreaterThan(0);
  });
});

describe('доступ без токена', () => {
  it('401 без токена и с поддельным токеном', async () => {
    expect((await client().get('/properties')).status).toBe(401);
    expect((await client('abc.def.ghi').get('/properties')).status).toBe(401);
    // Подменяем подпись корректного тестового JWT.
    const { token } = await newUser('forged');
    const [header, payload, signature] = token.split('.');
    const firstChar = signature[0] === 'A' ? 'B' : 'A';
    const forged = [header, payload, firstChar + signature.slice(1)].join('.');
    expect((await client(forged).get('/properties')).status).toBe(401);
  });

  it('health открыт', async () => {
    expect((await client().get('/health')).status).toBe(200);
  });
});
