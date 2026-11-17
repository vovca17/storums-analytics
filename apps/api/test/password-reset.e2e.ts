import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { newUser } from './client';
import { BASE, INTERNAL } from './env';

/** Вызов от имени сервера web (с секретом) или постороннего (без него / с чужим). */
async function check(body: unknown, secret: string | null = INTERNAL) {
  const res = await fetch(`${BASE}/auth/email-exists`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(secret !== null && { 'X-Internal-Secret': secret }) },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}

describe('проверка почты перед сбросом пароля', () => {
  it('без секрета или с чужим секретом — 404, ответа о почте нет', async () => {
    const u = await newUser('probe');
    expect((await u.get('/me')).status).toBe(200);
    for (const secret of [null, '', 'wrong', `${INTERNAL}x`]) {
      const r = await check({ email: u.email }, secret);
      expect(r.status, String(secret)).toBe(404);
      expect(JSON.stringify(r.body)).not.toContain('exists');
    }
  });

  it('незарегистрированная почта — предложение регистрации', async () => {
    const r = await check({ email: `${randomUUID()}@e2e.test` });
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ exists: false });
  });

  it('зарегистрированная почта находится, с пробелами и другим регистром', async () => {
    const u = await newUser('reset');
    expect((await u.get('/me')).status).toBe(200);
    const r = await check({ email: `  ${u.email.toUpperCase()}  ` });
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ exists: true });
    // Отдаём только результат проверки, без профиля и идентификатора пользователя.
    expect(Object.keys(r.body)).toEqual(['exists']);

    expect((await u.del('/me')).status).toBe(204);
    expect((await check({ email: u.email })).body).toEqual({ exists: false });
  });

  it('неверный email отклоняется', async () => {
    for (const body of [{}, { email: 'не почта' }, { email: 42 }]) {
      expect((await check(body)).status).toBe(400);
    }
  });
});
