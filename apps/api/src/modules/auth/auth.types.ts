export interface AuthUser {
  /** Supabase auth uid = User.id */
  id: string;
  email: string;
  /** Когда выдан токен (iat): токены, выданные до удаления аккаунта, не принимаются */
  issuedAt: Date;
}

declare module 'express' {
  interface Request {
    user?: AuthUser;
  }
}
