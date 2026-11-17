import { describe, expect, it } from 'vitest';
import { client, newUser } from './client';
import { CRON } from './env';

const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);

describe('ежедневная задача', () => {
  it('без секрета — 403', async () => {
    expect((await client().get('/cron/daily')).status).toBe(403);
    expect((await client('wrong').get('/cron/daily')).status).toBe(403);
  });

  it('квартира с закончившимся договором становится «Свободна», остальные не меняются', async () => {
    const u = await newUser('cron');
    const mk = async (title: string, extra = {}) =>
      (await u.post('/properties', { title, address: 'г Москва, д 3', regionCode: '77', areaM2: '30', ...extra })).body.id as string;
    const ended = await mk('Договор закончился');
    const active = await mk('Договор идёт');
    const daily = await mk('Посуточная', { dailyRent: true, status: 'RENTED' });
    await u.post(`/properties/${ended}/leases`, { tenant: { fullName: 'Т1' }, startDate: daysAgo(400), endDate: daysAgo(2), rentAmount: '1000' });
    await u.post(`/properties/${active}/leases`, { tenant: { fullName: 'Т2' }, startDate: daysAgo(30), rentAmount: '1000' });
    expect((await u.get(`/properties/${ended}`)).body.status).toBe('VACANT');
    // Имитируем старый несогласованный статус: ежедневная задача должна его исправить.
    await u.patch(`/properties/${ended}`, { status: 'RENTED' });

    const r = await client(CRON).get('/cron/daily');
    expect(r.status).toBe(200);
    expect(r.body.vacated).toBeGreaterThanOrEqual(1);
    expect((await u.get(`/properties/${ended}`)).body.status).toBe('VACANT');
    expect((await u.get(`/properties/${active}`)).body.status).toBe('RENTED');
    expect((await u.get(`/properties/${daily}`)).body.status).toBe('RENTED');
  });
});
