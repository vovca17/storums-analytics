# Storums Analytics

Серверная часть Storums для разработки аналитики по аренде. API построен на NestJS и использует PostgreSQL через Prisma.

| Где | Что искать |
|---|---|
| `apps/api/src/modules/finance` | Движение денег, категории, помесячная сводка, доходность |
| `packages/db/prisma` | Модели, связи, история миграций и системные категории |
| `packages/shared/src/finance` | Расчёт аренды, налога, расходов и доходности |
| `apps/api/test` | Примеры запросов и синтетические сценарии, в том числе изоляция данных пользователей |

## Локальный запуск

Нужны Node.js 26 и pnpm 10.18.0. PostgreSQL запускается локально через `pnpm db:start`.

```bash
pnpm install --frozen-lockfile
cp packages/db/.env.example packages/db/.env
cp apps/api/.env.example apps/api/.env
# Впишите результат этой команды в SUPABASE_JWT_SECRET в apps/api/.env.
openssl rand -hex 32

# Оставьте PostgreSQL запущенным в отдельном терминале.
pnpm db:start
```

В другом терминале из корня репозитория:

```bash
pnpm --filter @storums/db migrate:deploy
pnpm build
pnpm db:seed
pnpm --filter @storums/api start
```

Базовый адрес API — `http://localhost:4000/api/v1`, Swagger — `http://localhost:4000/api/docs`. Для проверки запуска доступен `GET /api/v1/health`.

У аналитики есть `GET /api/v1/analytics/monthly` и `GET /api/v1/analytics/yield`. Помесячная сводка принимает те же фильтры, что и список операций. Оба запроса требуют Bearer-токен и возвращают данные текущего пользователя. Для локального эксперимента выпустите токен для вымышленного пользователя:

```bash
cd apps/api
node --env-file=.env --input-type=module <<'JS'
import { randomUUID } from 'node:crypto';
import { SignJWT } from 'jose';

const secret = process.env.SUPABASE_JWT_SECRET;
if (!secret) throw new Error('Задайте SUPABASE_JWT_SECRET в .env');

console.log(await new SignJWT({ email: 'analyst@example.test', role: 'authenticated' })
  .setProtectedHeader({ alg: 'HS256' })
  .setIssuer(process.env.SUPABASE_URL + '/auth/v1')
  .setAudience('authenticated')
  .setSubject(randomUUID())
  .setIssuedAt()
  .setExpirationTime('1h')
  .sign(new TextEncoder().encode(secret)));
JS
```

Вставьте токен в Swagger через **Authorize**. Для заполнения базы синтетическими операциями используйте сценарии из `apps/api/test/analytics.e2e.ts`. `pnpm db:seed` добавляет системные категории.

`pnpm test` запускает unit-тесты. Для `pnpm --filter @storums/api test:e2e` создайте отдельную пустую БД `storums_test` в локальном PostgreSQL. Тесты применяют к ней миграции и очищают таблицу пользователей и зависимые записи.
