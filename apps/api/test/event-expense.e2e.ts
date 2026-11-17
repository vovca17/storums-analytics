import { describe, expect, it } from 'vitest';
import { todayIso } from '@storums/shared';
import { newUser } from './client';

const today = todayIso();

async function fixture() {
  const u = await newUser('event-expense');
  const p = await u.post('/properties', { title: 'Расходы', address: 'г Москва, д 1', regionCode: '77', areaM2: '40' });
  const propertyId = p.body.id as string;
  const txs = async () => (await u.get(`/transactions?propertyId=${propertyId}`)).body as any[];
  const event = async (extra: object = {}) => {
    const r = await u.post('/events', { title: 'Уборка', propertyId, date: today, amount: '1500', kind: 'CLEANING', countAsExpense: true, ...extra });
    expect(r.status).toBe(201);
    return r.body.id as string;
  };
  return { u, propertyId, txs, event };
}

describe('событие: учёт стоимости в расходах', () => {
  it('отметка создаёт один расход, он защищён, снятие отметки его убирает', async () => {
    const f = await fixture();
    const id = await f.event();
    expect((await f.u.post(`/events/${id}/complete`, { date: today })).status).toBe(204);
    expect((await f.u.post(`/events/${id}/complete`, { date: today })).status).toBe(204);
    const list = await f.txs();
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ type: 'EXPENSE', amount: '1500.00', comment: 'Уборка', category: { systemKey: 'cleaning' } });
    expect(list[0].date.slice(0, 10)).toBe(today);
    expect(list[0].eventCompletionId).not.toBeNull();
    expect((await f.u.patch(`/transactions/${list[0].id}`, { amount: '1' })).status).toBe(400);
    expect((await f.u.del(`/transactions/${list[0].id}`)).status).toBe(400);

    expect((await f.u.del(`/events/${id}/complete?date=${today}`)).status).toBe(204);
    expect(await f.txs()).toHaveLength(0);
  });

  it('после удаления события операция остаётся и становится обычной', async () => {
    const f = await fixture();
    const id = await f.event();
    await f.u.post(`/events/${id}/complete`, { date: today });
    expect((await f.u.del(`/events/${id}`)).status).toBe(204);
    const list = await f.txs();
    expect(list).toHaveLength(1);
    expect(list[0].eventCompletionId).toBeNull();
    expect((await f.u.patch(`/transactions/${list[0].id}`, { amount: '1600' })).status).toBe(200);
  });

  it('без квартиры или суммы галочку поставить нельзя', async () => {
    const f = await fixture();
    expect((await f.u.post('/events', { title: 'Уборка', date: today, amount: '1500', countAsExpense: true })).status).toBe(400);
    expect((await f.u.post('/events', { title: 'Уборка', propertyId: f.propertyId, date: today, countAsExpense: true })).status).toBe(400);
    const id = await f.event({ countAsExpense: false, amount: undefined });
    expect((await f.u.patch(`/events/${id}`, { countAsExpense: true })).status).toBe(400);
    expect((await f.u.patch(`/events/${id}`, { countAsExpense: true, amount: '700' })).status).toBe(200);
    // PATCH без поля галочку не сбрасывает
    expect((await f.u.patch(`/events/${id}`, { title: 'Клининг' })).status).toBe(200);
    expect((await f.u.get('/events')).body.find((e: any) => e.id === id).countAsExpense).toBe(true);
  });

  it('без галочки отметка расход не создаёт', async () => {
    const f = await fixture();
    const id = await f.event({ countAsExpense: false });
    await f.u.post(`/events/${id}/complete`, { date: today });
    expect(await f.txs()).toHaveLength(0);
  });
});
