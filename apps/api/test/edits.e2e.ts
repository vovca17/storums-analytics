import { describe, expect, it } from 'vitest';
import { newUser } from './client';

describe('очистка полей при правке', () => {
  it('цену и дату покупки можно стереть', async () => {
    const u = await newUser('clear');
    const p = await u.post('/properties', {
      title: 'С ценой', address: 'г Москва, д 1', regionCode: '77', areaM2: '30',
      purchasePrice: '9000000', purchaseDate: '2022-03-01',
    });
    const r = await u.patch(`/properties/${p.body.id}`, { purchasePrice: null, purchaseDate: null });
    expect(r.status).toBe(200);
    const after = (await u.get(`/properties/${p.body.id}`)).body;
    expect(after.purchasePrice).toBeNull();
    expect(after.purchaseDate).toBeNull();
  });

  it('имя в профиле можно стереть', async () => {
    const u = await newUser('noname');
    await u.patch('/me', { name: 'Иван' });
    expect((await u.patch('/me', { name: null })).status).toBe(200);
    expect((await u.get('/me')).body.name).toBeNull();
  });
});

describe('операции брони', () => {
  it('правятся только через бронь', async () => {
    const u = await newUser('booking-tx');
    const p = await u.post('/properties', { title: 'Посуточная', address: 'г Москва, д 1', regionCode: '77', areaM2: '30', dailyRent: true });
    await u.post(`/properties/${p.body.id}/bookings`, {
      guestName: 'Гость', checkIn: '2026-11-05', checkOut: '2026-11-07', amount: '6000', commission: '500', isPaid: true,
    });
    const txs = (await u.get(`/transactions?propertyId=${p.body.id}`)).body as Array<{ id: string; bookingId: string | null }>;
    expect(txs.length).toBe(2);
    expect(txs.every((t) => t.bookingId)).toBe(true);
    expect((await u.patch(`/transactions/${txs[0]!.id}`, { amount: '1' })).status).toBe(400);
    expect((await u.del(`/transactions/${txs[0]!.id}`)).status).toBe(400);
    expect(((await u.get(`/properties/${p.body.id}/bookings`)).body as unknown[]).length).toBe(1);
  });
});

describe('комментарий операции', () => {
  it('операция с комментарием создаётся и правится', async () => {
    const u = await newUser('comment');
    const p = await u.post('/properties', { title: 'К', address: 'г Москва, д 1', regionCode: '77', areaM2: '30' });
    const cats = (await u.get('/categories')).body as Array<{ id: string; systemKey: string | null }>;
    const other = cats.find((c) => c.systemKey === 'other_expense')!;
    const c = await u.post('/transactions', { propertyId: p.body.id, categoryId: other.id, type: 'EXPENSE', amount: '100', date: '2026-11-01', comment: 'Купил лампочки\nи смеситель' });
    expect(c.status).toBe(201);
    expect(c.body.comment).toBe('Купил лампочки\nи смеситель');
    const e = await u.patch(`/transactions/${c.body.id}`, { comment: 'Новый' });
    expect(e.status).toBe(200);
    expect((await u.patch(`/transactions/${c.body.id}`, { comment: null })).body.comment).toBeNull();
    const long = 'я'.repeat(501);
    expect((await u.patch(`/transactions/${c.body.id}`, { comment: long })).status).toBe(400);
  });

  it('управляющие символы (NUL) вырезаются, а не дают 500', async () => {
    const u = await newUser('comment-nul');
    const p = await u.post('/properties', { title: 'К', address: 'г Москва, д 1', regionCode: '77', areaM2: '30' });
    const cats = (await u.get('/categories')).body as Array<{ id: string; systemKey: string | null }>;
    const other = cats.find((c) => c.systemKey === 'other_expense')!;
    const c = await u.post('/transactions', { propertyId: p.body.id, categoryId: other.id, type: 'EXPENSE', amount: '100', date: '2026-11-01', comment: 'a\u0000b' });
    expect(c.status).toBe(201);
    expect(c.body.comment).toBe('ab');
    const e = await u.patch(`/transactions/${c.body.id}`, { comment: 'x\u0000y\nz' });
    expect(e.status).toBe(200);
    expect(e.body.comment).toBe('xy\nz');
  });

  it('правка без dailyRent не выключает посуточную аренду', async () => {
    const u = await newUser('daily-keep');
    const p = await u.post('/properties', { title: 'П', address: 'г Москва, д 1', regionCode: '77', areaM2: '30', dailyRent: true });
    await u.patch(`/properties/${p.body.id}`, { title: 'П2' });
    expect((await u.get(`/properties/${p.body.id}`)).body.dailyRent).toBe(true);
  });
});

describe('раскладка дашборда', () => {
  it('сохраняется, проверяется и сбрасывается', async () => {
    const u = await newUser('layout');
    expect((await u.patch('/me', { dashboardLayout: ['tax', 'kpi'] })).status).toBe(200);
    expect((await u.get('/me')).body.dashboardLayout).toEqual(['tax', 'kpi']);
    expect((await u.patch('/me', { dashboardLayout: ['kpi', 'kpi'] })).status).toBe(400);
    expect((await u.patch('/me', { dashboardLayout: ['bogus'] })).status).toBe(400);
    expect((await u.patch('/me', { dashboardLayout: null })).status).toBe(200);
    expect((await u.get('/me')).body.dashboardLayout).toBeNull();
  });
});
