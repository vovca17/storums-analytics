/** Общие настройки e2e: тестовая база и секрет локальных токенов. */
export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:54329/storums_test';
export const JWT_SECRET = 'e2e-secret-not-for-production-0123456789';
export const ISSUER = 'http://local.storums/auth/v1';
export const PORT = Number(process.env.E2E_PORT ?? 4555);
export const BASE = `http://localhost:${PORT}/api/v1`;
export const CRON = 'e2e-cron-secret-0123456789';
export const INTERNAL = 'e2e-internal-secret-0123456789abcdef';
