import { createClient, type Client, type InValue, type ResultSet } from '@libsql/client';

/**
 * Singleton libSQL client. Local: file:./data/rancang.db. Cloud: Turso URL.
 * Pragmas are applied once on first use (03_DATABASE §1.1).
 */
let _client: Client | null = null;
let _pragmasApplied = false;

export function getDb(): Client {
  if (_client) return _client;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');
  _client = createClient({
    url,
    authToken: process.env.DATABASE_AUTH_TOKEN || undefined,
  });
  return _client;
}

/** Test seam: swap the client (used by vitest with :memory:). */
export function setDbForTest(client: Client | null): void {
  _client = client;
  _pragmasApplied = false;
}

export async function applyPragmas(db: Client): Promise<void> {
  if (_pragmasApplied) return;
  // journal_mode returns a row; the rest do not. Run one by one.
  await db.execute('PRAGMA journal_mode = WAL');
  await db.execute('PRAGMA synchronous = NORMAL');
  await db.execute('PRAGMA foreign_keys = ON');
  await db.execute('PRAGMA busy_timeout = 5000');
  await db.execute('PRAGMA temp_store = MEMORY');
  _pragmasApplied = true;
}

/** Ready-to-use client with pragmas guaranteed. */
export async function db(): Promise<Client> {
  const client = getDb();
  await applyPragmas(client);
  return client;
}

export type SqlParams = InValue[];

export async function query<T>(sql: string, params: SqlParams = []): Promise<T[]> {
  const client = await db();
  const rs: ResultSet = await client.execute({ sql, args: params });
  return rs.rows as unknown as T[];
}

export async function queryOne<T>(sql: string, params: SqlParams = []): Promise<T | null> {
  const rows = await query<T>(sql, params);
  return rows.length > 0 ? (rows[0] as T) : null;
}

export async function execute(sql: string, params: SqlParams = []): Promise<{ rowsAffected: number }> {
  const client = await db();
  const rs = await client.execute({ sql, args: params });
  return { rowsAffected: Number(rs.rowsAffected) };
}

/**
 * Write transaction. libSQL batches statements atomically for the file driver.
 * `work` receives no handle — it enqueues statements via the returned collector,
 * which are then applied in one batch (all-or-nothing).
 */
export async function transaction(work: (tx: TransactionBuilder) => Promise<void>): Promise<void> {
  const client = await db();
  const builder = new TransactionBuilderImpl();
  await work(builder);
  await builder.flush(client);
}

export interface TransactionBuilder {
  run(sql: string, params?: SqlParams): void;
}

class TransactionBuilderImpl implements TransactionBuilder {
  private statements: { sql: string; args: InValue[] }[] = [];

  run(sql: string, params: SqlParams = []): void {
    this.statements.push({ sql, args: params });
  }

  async flush(client: Client): Promise<void> {
    if (this.statements.length === 0) return;
    await client.batch(this.statements, 'write');
  }
}
