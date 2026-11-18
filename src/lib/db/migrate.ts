import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { getDb, applyPragmas } from './client';

/**
 * Sequential .sql migration runner (02_ARCHITECTURE Appendix B).
 * - Reads migrations/*.sql sorted lexicographically
 * - Ensures _migrations table exists
 * - For each unapplied file, executes it and records { filename, applied_at }
 * - Idempotent: safe to run on every boot in dev
 */
export async function runMigrations(migrationsDir?: string): Promise<string[]> {
  const dir = migrationsDir ?? path.resolve(process.cwd(), 'migrations');
  const client = getDb();
  await applyPragmas(client);

  await client.execute(`CREATE TABLE IF NOT EXISTS _migrations (
    id TEXT PRIMARY KEY,
    applied_at TEXT NOT NULL
  )`);

  const applied = new Set(
    (await client.execute('SELECT id FROM _migrations')).rows.map((r) => String(r.id)),
  );

  const files = (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort();
  const appliedNow: string[] = [];

  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = await readFile(path.join(dir, file), 'utf8');
    // executeMultiple runs the script statement-by-statement; a failure mid-way
    // leaves the DB inconsistent, so we snapshot-restore via a backup copy is
    // overkill for dev — instead record only after success and surface the error.
    await client.executeMultiple(sql);
    await client.execute('INSERT INTO _migrations (id, applied_at) VALUES (?, ?)', [file, new Date().toISOString()]);
    appliedNow.push(file);
  }

  return appliedNow;
}
