import { execSync, spawn, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { PrismaClient } from '@storums/db';
import { BASE, CRON, INTERNAL, JWT_SECRET, PORT, TEST_DATABASE_URL } from './env';

const dbDir = resolve(__dirname, '../../../packages/db');
const apiDir = resolve(__dirname, '..');
let server: ChildProcess | undefined;

/** Чистая тестовая база (миграции + системные статьи) и запущенный API из dist. */
export async function setup() {
  if (!/test/i.test(TEST_DATABASE_URL)) {
    throw new Error(`TEST_DATABASE_URL должен указывать на тестовую базу (в имени «test»): ${TEST_DATABASE_URL}`);
  }
  const dbEnv = { ...process.env, DATABASE_URL: TEST_DATABASE_URL, DIRECT_URL: TEST_DATABASE_URL };
  execSync('npx prisma migrate deploy', { cwd: dbDir, env: dbEnv, stdio: 'pipe' });
  const prisma = new PrismaClient({ datasourceUrl: TEST_DATABASE_URL });
  // CASCADE очищает и все таблицы, ссылающиеся на User, включая статьи — системные вернёт seed
  await prisma.$executeRawUnsafe('TRUNCATE "User" CASCADE');
  await prisma.$disconnect();
  execSync('npx tsx prisma/seed.ts', { cwd: dbDir, env: dbEnv, stdio: 'pipe' });

  if (!existsSync(resolve(apiDir, 'dist/main.js'))) throw new Error('Сначала соберите API: npx nest build');
  server = spawn('node', ['dist/main.js'], {
    cwd: apiDir,
    env: {
      ...process.env,
      PORT: String(PORT),
      DATABASE_URL: TEST_DATABASE_URL,
      DIRECT_URL: TEST_DATABASE_URL,
      SUPABASE_URL: 'http://local.storums',
      SUPABASE_JWT_SECRET: JWT_SECRET,
      WEB_ORIGIN: 'http://localhost:3000',
      CRON_SECRET: CRON,
      INTERNAL_API_SECRET: INTERNAL,
    },
    stdio: ['ignore', 'ignore', 'inherit'],
  });
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(`${BASE}/health`)).ok) return;
    } catch {
      // ещё стартует
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error('API не поднялся за 20 секунд');
}

export async function teardown() {
  server?.kill();
}
