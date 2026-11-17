// Локальный Postgres без Docker: бинарники из npm-пакета embedded-postgres,
// данные в packages/db/.pgdata. Запуск: pnpm db:start (Ctrl+C — остановить).
import EmbeddedPostgres from 'embedded-postgres';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const dataDir = fileURLToPath(new URL('../.pgdata', import.meta.url));
const port = 54329;

const pg = new EmbeddedPostgres({
  databaseDir: dataDir,
  user: 'postgres',
  password: 'postgres',
  port,
  persistent: true,
  onLog: () => {},
});

if (!existsSync(dataDir)) await pg.initialise();
await pg.start();
try {
  await pg.createDatabase('storums');
} catch {
  // база уже есть
}
console.log(`Postgres запущен: postgresql://postgres:postgres@localhost:${port}/storums`);

const stop = async () => {
  await pg.stop();
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
