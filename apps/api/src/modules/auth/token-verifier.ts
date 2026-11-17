import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';
import type { Env } from '../../config';

/**
 * Проверяет access token Supabase.
 * Новые проекты подписывают токены асимметричным ключом → проверяем через JWKS.
 * Старые проекты с HS256 → через SUPABASE_JWT_SECRET.
 * При переезде с Supabase меняется только этот класс.
 */
@Injectable()
export class TokenVerifier {
  private readonly issuer: string;
  private readonly secret?: Uint8Array;
  private readonly jwks: ReturnType<typeof createRemoteJWKSet>;

  constructor(config: ConfigService<Env, true>) {
    const url = config.get('SUPABASE_URL', { infer: true }).replace(/\/$/, '');
    this.issuer = `${url}/auth/v1`;
    const secret = config.get('SUPABASE_JWT_SECRET', { infer: true });
    if (secret) this.secret = new TextEncoder().encode(secret);
    this.jwks = createRemoteJWKSet(new URL(`${this.issuer}/.well-known/jwks.json`));
  }

  async verify(token: string): Promise<JWTPayload> {
    const opts = { issuer: this.issuer, audience: 'authenticated' };
    const { payload } = this.secret
      ? await jwtVerify(token, this.secret, opts)
      : await jwtVerify(token, this.jwks, opts);
    return payload;
  }
}
