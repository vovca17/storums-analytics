import { afterAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '@storums/db';
import { todayIso, addDays } from '@storums/shared';
import { client, newUser } from './client';
import { CRON, TEST_DATABASE_URL } from './env';

const db = new PrismaClient({ datasourceUrl: TEST_DATABASE_URL });
afterAll(() => db.$disconnect());
const today = todayIso();
const day = (n: number) => addDays(today, n);

async function fixture() {
  const u = await newUser('lease-safety');
  const p = await u.post('/properties', { title: 'Договоры', address: 'г Москва, д 1', regionCode: '77', areaM2: '40' });
  const id = p.body.id;
  const create = (startDate: string, endDate?: string) => u.post(`/properties/${id}/leases`, {
    tenant: { fullName: 'Арендатор' }, startDate, endDate, rentAmount: '50000',
  });
  const status = async () => (await u.get(`/properties/${id}`)).body.status;
  return { u, id, create, status };
}

describe('даты договоров и статус квартиры', () => {
  it('последний день включён, правка дат сразу обновляет статус', async () => {
    const f = await fixture();
    const l = await f.create(day(-30));
    expect(l.status).toBe(201);
    const url = `/properties/${f.id}/leases/${l.body.id}`;
    expect((await f.u.post(`${url}/end`, { endDate: today })).status).toBe(201);
    expect(await f.status()).toBe('RENTED');
    expect((await f.u.patch(url, { endDate: day(-1) })).status).toBe(200);
    expect(await f.status()).toBe('VACANT');
    expect((await f.u.patch(url, { endDate: null })).status).toBe(200);
    expect(await f.status()).toBe('RENTED');
  });

  it('завершение старого договора не освобождает занятую квартиру, пересечение при правке отклоняется', async () => {
    const f = await fixture();
    const old = await f.create(day(-40));
    expect((await f.create(day(-10))).status).toBe(201);
    const oldUrl = `/properties/${f.id}/leases/${old.body.id}`;
    expect((await f.u.post(`${oldUrl}/end`, { endDate: day(-15) })).status).toBe(201);
    expect(await f.status()).toBe('RENTED');
    expect((await f.u.patch(oldUrl, { endDate: day(5) })).status).toBe(400);
    expect((await f.u.patch(oldUrl, { endDate: null })).status).toBe(400);
    expect(await f.status()).toBe('RENTED');
  });

  it('будущий договор не занимает квартиру заранее, ежедневная задача включает его в день начала', async () => {
    const f = await fixture();
    const future = await f.create(day(10));
    expect(future.status).toBe(201);
    expect(await f.status()).toBe('VACANT');
    await db.lease.update({ where: { id: future.body.id }, data: { startDate: new Date(today) } });
    const r = await client(CRON).get('/cron/daily');
    expect(r.status).toBe(200);
    expect(r.body.activated).toBeGreaterThanOrEqual(1);
    expect(await f.status()).toBe('RENTED');
  });

  it('два одновременных договора с одним началом не создаются', async () => {
    const f = await fixture();
    const results = await Promise.all([f.create(today), f.create(today)]);
    expect(results.map(r => r.status).sort()).toEqual([201, 400]);
  });
});
