import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import type { Client } from '@libsql/client';
import { getDb, applyPragmas } from './client';

/**
 * Sequential .sql migration runner (02_ARCHITECTURE Appendix B).
 * - Reads migrations/*.sql sorted lexicographically
 * - Ensures _migrations table exists
 * - For each unapplied file, executes it and records { filename, applied_at }
 * - Idempotent: safe to run on every boot in dev
 *
 * Each file and its ledger row are applied in ONE write transaction. A file
 * that fails half-way leaves neither a partial schema change nor a ledger row,
 * so the next run retries the same file from a clean state instead of skipping
 * it forever.
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
    await applyMigrationFile(client, file, sql);
    appliedNow.push(file);
  }

  return appliedNow;
}

/**
 * Apply one migration file and record it atomically.
 *
 * The ledger INSERT is the last statement of the same transaction as the DDL,
 * so the two can never disagree: either the schema is there and the file is
 * recorded, or neither happened. SQLite DDL is transactional, which is what
 * makes the rollback of a half-applied file real rather than nominal.
 */
async function applyMigrationFile(client: Client, file: string, sql: string): Promise<void> {
  const tx = await client.transaction('write');
  try {
    await tx.executeMultiple(sql);
    await tx.execute({
      sql: 'INSERT INTO _migrations (id, applied_at) VALUES (?, ?)',
      args: [file, new Date().toISOString()],
    });
    await tx.commit();
  } catch (e) {
    try {
      await tx.rollback();
    } catch {
      // Already closed by the driver (an unrecoverable failure does that);
      // the driver rolls an open transaction back when it releases the
      // connection, and the original error is the one worth reporting.
    }
    throw e;
  } finally {
    tx.close();
  }
}
