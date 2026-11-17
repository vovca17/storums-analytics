import { randomUUID } from 'node:crypto';
import { SignJWT } from 'jose';
import { BASE, ISSUER, JWT_SECRET } from './env';

export type Res = { status: number; body: any; headers: Headers }; // eslint-disable-line @typescript-eslint/no-explicit-any

/** Новый пользователь: токен как у локального входа и HTTP-клиент от его имени. */
export async function newUser(name = 'user', id = randomUUID()) {
  const email = `${name}-${id.slice(0, 8)}@e2e.test`;
  const token = await new SignJWT({ email, role: 'authenticated' })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(id)
    .setIssuer(ISSUER)
    .setAudience('authenticated')
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(new TextEncoder().encode(JWT_SECRET));
  return { id, email, token, ...client(token) };
}

export function client(token?: string) {
  const call = async (method: string, path: string, body?: unknown): Promise<Res> => {
    const res = await fetch(`${BASE}${path}`, {
      method,
      headers: {
        ...(token && { Authorization: `Bearer ${token}` }),
        ...(body !== undefined && { 'Content-Type': 'application/json' }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    return { status: res.status, body: text ? JSON.parse(text) : null, headers: res.headers };
  };
  return {
    get: (p: string) => call('GET', p),
    post: (p: string, b?: unknown) => call('POST', p, b ?? {}),
    patch: (p: string, b: unknown) => call('PATCH', p, b),
    del: (p: string) => call('DELETE', p),
  };
}
