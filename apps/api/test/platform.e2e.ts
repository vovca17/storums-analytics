import { describe, expect, it } from 'vitest';
import { newUser } from './client';

describe('заголовки безопасности', () => {
  it('есть на ответах API', async () => {
    const u = await newUser('h');
    const r = await u.get('/me');
    expect(r.headers.get('x-content-type-options')).toBe('nosniff');
    expect(r.headers.get('x-frame-options')).toBe('DENY');
    expect(r.headers.get('cache-control')).toBe('no-store');
    expect(r.headers.get('content-security-policy')).toContain("default-src 'none'");
    expect(r.headers.get('x-powered-by')).toBeNull();
  });
});

describe('ограничение частоты запросов', () => {
  it('после 60 изменений в минуту — 429, у другого пользователя свой лимит', async () => {
    const u = await newUser('flood');
    const statuses: number[] = [];
    for (let i = 0; i < 65; i++) statuses.push((await u.post('/categories', {})).status); // пустое тело → 400, но запрос считается
    expect(statuses.slice(0, 60).every((s) => s === 400)).toBe(true);
    expect(statuses.slice(60).every((s) => s === 429)).toBe(true);
    const other = await newUser('calm');
    expect((await other.post('/categories', {})).status).toBe(400);
  });
});

describe('удаление аккаунта', () => {
  it('удаляет все данные пользователя', async () => {
    const u = await newUser('gone');
    const p = await u.post('/properties', { title: 'К удалению', address: 'г Москва, д 2', regionCode: '77', areaM2: '30' });
    await u.post(`/properties/${p.body.id}/leases`, { tenant: { fullName: 'Т' }, startDate: '2026-01-01', rentAmount: '1000' });
    const cat = await u.post('/categories', { name: 'Моя', type: 'EXPENSE' });
    await u.post('/transactions', { propertyId: p.body.id, categoryId: cat.body.id, type: 'EXPENSE', amount: '10', date: '2026-11-01' });
    expect((await u.del('/me')).status).toBe(204);
    // Тот же токен после удаления больше не принимается: аккаунт не пересоздаётся пустым
    expect((await u.get('/properties')).status).toBe(401);
    expect((await u.get('/me')).status).toBe(401);
  });

  it('новый вход после удаления работает (токен выдан позже удаления)', async () => {
    const u = await newUser('again');
    expect((await u.get('/me')).status).toBe(200);
    expect((await u.del('/me')).status).toBe(204);
    await new Promise((r) => setTimeout(r, 1100)); // iat у JWT в секундах
    const fresh = await newUser('again', u.id);
    expect((await fresh.get('/me')).status).toBe(200);
    expect((await fresh.get('/properties')).body).toEqual([]);
  });
});
