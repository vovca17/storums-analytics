import { describe, expect, it } from 'vitest';
import { addDays, todayIso } from '@storums/shared';
import { newUser } from './client';

const day = (n: number) => addDays(todayIso(), n);

async function fixture() {
  const u = await newUser('parallel-bookings');
  const p = await u.post('/properties', { title: 'Посуточная', address: 'г Москва, д 1', regionCode: '77', areaM2: '40', dailyRent: true });
  const url = `/properties/${p.body.id}/bookings`;
  const body = (start: number, end: number) => ({ guestName: 'Гость', checkIn: day(start), checkOut: day(end), amount: '10000', commission: '1000', isPaid: true });
  return { u, url, body, propertyId: p.body.id };
}

describe('одновременные брони', () => {
  it('одни и те же ночи получает только один запрос, доход и комиссия не дублируются', async () => {
    const f = await fixture();
    const r = await Promise.all([f.u.post(f.url, f.body(10, 15)), f.u.post(f.url, f.body(10, 15))]);
    expect(r.map(x => x.status).sort()).toEqual([201, 409]);
    expect((await f.u.get(f.url)).body).toHaveLength(1);
    expect((await f.u.get(`/transactions?propertyId=${f.propertyId}`)).body).toHaveLength(2);
    // В день выезда можно заселиться следующему гостю.
    expect((await f.u.post(f.url, f.body(15, 18))).status).toBe(201);
  });

  it('одновременный перенос разных броней на свободные даты не создаёт пересечение', async () => {
    const f = await fixture();
    const first = await f.u.post(f.url, f.body(1, 3));
    const second = await f.u.post(f.url, f.body(4, 6));
    const dates = { checkIn: day(10), checkOut: day(15) };
    const r = await Promise.all([
      f.u.patch(`${f.url}/${first.body.id}`, dates), f.u.patch(`${f.url}/${second.body.id}`, dates),
    ]);
    expect(r.map(x => x.status).sort()).toEqual([200, 409]);
  });
});
