import { z } from 'zod';

const Env = z.object({
  PORT: z.coerce.number().default(4000),
  WEB_ORIGIN: z.string().default('http://localhost:3000'),
  DATABASE_URL: z.string().min(1),
  SUPABASE_URL: z.string().url(),
  SUPABASE_JWT_SECRET: z.string().optional(),
  /** Ключ service_role: нужен только для удаления входа пользователя в Supabase Auth */
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
  /** Секрет Vercel Cron: без него /cron/* выключены */
  CRON_SECRET: z.string().min(16).optional(),
  /** Общий секрет web ↔ API для служебных эндпоинтов (проверка почты). Без него они выключены. */
  INTERNAL_API_SECRET: z.string().min(32).optional(),
});

export type Env = z.infer<typeof Env>;

export function validateEnv(raw: Record<string, unknown>): Env {
  const parsed = Env.safeParse(raw);
  if (!parsed.success) {
    throw new Error(`Неверные переменные окружения:\n${parsed.error.toString()}`);
  }
  return parsed.data;
}
