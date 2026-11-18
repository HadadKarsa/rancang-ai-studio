import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { getDb, applyPragmas } from '../src/lib/db/client';
import { runMigrations } from '../src/lib/db/migrate';

/**
 * CLI: pnpm db:migrate — applies migrations/*.sql in order, records in _migrations.
 */
async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL is not set. Copy .env.example to .env.local first.');
    process.exit(1);
  }
  // dotenv-cli loads .env.local when invoked via pnpm; also accept --env-file.
  const dir = path.resolve(process.cwd(), 'migrations');
  const db = getDb();
  await applyPragmas(db);
  const applied = await runMigrations(dir);
  const files = (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort();
  console.log(`migrations: ${files.length} file(s), ${applied.length} newly applied`);
  for (const f of applied) console.log(`  + ${f}`);
  if (applied.length === 0) console.log('  (already up to date)');
}

main().catch((err) => {
  console.error('migration failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});

export { readFile };
