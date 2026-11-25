/**
 * v0.2.2 Slice A verification — isolated DB, no network, no real credentials.
 * Run: DATABASE_URL=file:<tmp> ENCRYPTION_KEY=<32b64> tsx scripts/verify-sliceA.ts
 */
import { randomBytes } from 'node:crypto';
import { mkdtemp, mkdir, writeFile, cp, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createClient } from '@libsql/client';
import { getDb, setDbForTest } from '../src/lib/db/client';
import { runMigrations } from '../src/lib/db/migrate';
import { createCredential, createPreset, updatePreset, getPresetForUser, updateCredentialCachedModels, listCredentialsForUser } from '../src/lib/db/repositories/credentials';
import { buildProviderOptions } from '../src/lib/llm/registry';

const results: string[] = [];
function check(name: string, ok: boolean, detail = ''): void {
  results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) process.exitCode = 1;
}

async function main(): Promise<void> {
  const db = getDb();

  // 1. migration idempotency
  const first = await runMigrations();
  const second = await runMigrations();
  check('migration 003 applied once', first.includes('003_reasoning_and_models_cache.sql'), first.join(','));
  check('second migrate is a no-op', second.length === 0, second.join(',') || 'nothing applied');

  const presetCols = (await db.execute('PRAGMA table_info(llm_presets)')).rows.map((r) => String(r.name));
  const credCols = (await db.execute('PRAGMA table_info(provider_credentials)')).rows.map((r) => String(r.name));
  check('llm_presets.reasoning_effort exists', presetCols.includes('reasoning_effort'));
  check('provider_credentials.cached_models_json exists', credCols.includes('cached_models_json'));

  // 2. seed a user (FK target for both tables)
  const now = new Date().toISOString();
  await db.execute(
    `INSERT INTO users (id, email, role, auth_provider, created_at, updated_at) VALUES (?, ?, 'owner', 'local', ?, ?)`,
    ['usr_test', 'test@example.invalid', now, now],
  );

  // 3. credential round-trip with a cached model list
  const cred = await createCredential({
    userId: 'usr_test', provider: 'custom', label: 'test', encryptedKeyB64: 'x', keyIvB64: 'y',
    keyTagB64: 'z', keyLast4: 'abcd', baseUrl: 'http://127.0.0.1:9/v1',
    cachedModels: ['model-a', 'model-b'],
  });
  check('createCredential returns cachedModels', JSON.stringify(cred.cachedModels) === '["model-a","model-b"]', JSON.stringify(cred.cachedModels));

  await updateCredentialCachedModels(cred.id, 'usr_test', ['model-c']);
  const reread = (await listCredentialsForUser('usr_test'))[0];
  check('updateCredentialCachedModels persists', JSON.stringify(reread?.cachedModels) === '["model-c"]', JSON.stringify(reread?.cachedModels));

  // a corrupt cache must not throw
  await db.execute('UPDATE provider_credentials SET cached_models_json = ? WHERE id = ?', ['{not json', cred.id]);
  const corrupt = (await listCredentialsForUser('usr_test'))[0];
  check('malformed cache degrades to []', Array.isArray(corrupt?.cachedModels) && corrupt.cachedModels.length === 0);

  // 4. preset reasoningEffort on create + patch
  const preset = await createPreset({
    userId: 'usr_test', name: 'p1', provider: 'custom', modelId: 'm', credentialId: cred.id, reasoningEffort: 'medium',
  });
  check('createPreset stores reasoningEffort', preset.reasoningEffort === 'medium', String(preset.reasoningEffort));

  await updatePreset(preset.id, 'usr_test', { reasoningEffort: 'high' });
  const patched = await getPresetForUser(preset.id, 'usr_test');
  check('updatePreset patches reasoningEffort', patched?.reasoningEffort === 'high', String(patched?.reasoningEffort));

  await updatePreset(preset.id, 'usr_test', { reasoningEffort: null });
  const cleared = await getPresetForUser(preset.id, 'usr_test');
  check('updatePreset clears reasoningEffort to null', cleared?.reasoningEffort === null, String(cleared?.reasoningEffort));

  // the DB CHECK must still hold
  let rejected = false;
  try {
    await db.execute('UPDATE llm_presets SET reasoning_effort = ? WHERE id = ?', ['extreme', preset.id]);
  } catch {
    rejected = true;
  }
  check('CHECK rejects an invalid effort', rejected);

  // 4b. REGRESSION: a PATCH that does not mention reasoningEffort must keep it.
  await updatePreset(preset.id, 'usr_test', { reasoningEffort: 'medium' });
  await updatePreset(preset.id, 'usr_test', { name: 'renamed' });
  const afterName = await getPresetForUser(preset.id, 'usr_test');
  check('PATCH name preserves reasoningEffort', afterName?.reasoningEffort === 'medium', String(afterName?.reasoningEffort));

  await updatePreset(preset.id, 'usr_test', { temperature: 0.2, maxTokens: 2000 });
  const afterSampling = await getPresetForUser(preset.id, 'usr_test');
  check('PATCH temperature/maxTokens preserves reasoningEffort', afterSampling?.reasoningEffort === 'medium', String(afterSampling?.reasoningEffort));

  await updatePreset(preset.id, 'usr_test', { isDefault: true });
  const afterDefault = await getPresetForUser(preset.id, 'usr_test');
  check('PATCH isDefault preserves reasoningEffort', afterDefault?.reasoningEffort === 'medium', String(afterDefault?.reasoningEffort));

  // An empty patch is a no-op, not a wipe.
  await updatePreset(preset.id, 'usr_test', {});
  const afterEmpty = await getPresetForUser(preset.id, 'usr_test');
  check('empty PATCH preserves reasoningEffort', afterEmpty?.reasoningEffort === 'medium', String(afterEmpty?.reasoningEffort));

  // 5. buildProviderOptions mapping
  const openai = buildProviderOptions('openai', 'medium');
  check('openai medium', JSON.stringify(openai) === '{"openai":{"reasoningEffort":"medium"}}', JSON.stringify(openai));
  check('null effort → undefined', buildProviderOptions('openai', null) === undefined);
  const googleNone = buildProviderOptions('google', 'none');
  check('google none → thinkingBudget 0', JSON.stringify(googleNone) === '{"google":{"thinkingConfig":{"thinkingBudget":0}}}', JSON.stringify(googleNone));
  const googleHigh = buildProviderOptions('google', 'high');
  check('google high → thinkingLevel', JSON.stringify(googleHigh) === '{"google":{"thinkingConfig":{"thinkingLevel":"high"}}}', JSON.stringify(googleHigh));
  const aNone = buildProviderOptions('anthropic', 'none');
  check('anthropic none → disabled', JSON.stringify(aNone) === '{"anthropic":{"thinking":{"type":"disabled"}}}', JSON.stringify(aNone));
  const aMed = buildProviderOptions('anthropic', 'medium');
  check('anthropic medium → 8192', JSON.stringify(aMed) === '{"anthropic":{"thinking":{"type":"enabled","budgetTokens":8192}}}', JSON.stringify(aMed));
  const aHigh = buildProviderOptions('anthropic', 'high');
  check('anthropic high → 16384', JSON.stringify(aHigh) === '{"anthropic":{"thinking":{"type":"enabled","budgetTokens":16384}}}', JSON.stringify(aHigh));
  const aLow = buildProviderOptions('anthropic', 'low');
  check('anthropic low → 2048', JSON.stringify(aLow) === '{"anthropic":{"thinking":{"type":"enabled","budgetTokens":2048}}}', JSON.stringify(aLow));

  // 6. ATOMICITY: a migration that fails half-way must roll back both the
  //    schema change and its ledger row.
  await checkMigrationAtomicity();

  console.log(results.join('\n'));
  const failed = results.filter((r) => r.startsWith('FAIL')).length;
  console.log(`\n${results.length - failed}/${results.length} passed`);
  void randomBytes;
}

/**
 * Build a throwaway migration directory from the real ones plus one bad file
 * whose first statement is valid and second is not, run it against a fresh
 * isolated DB, and prove nothing from that file survived.
 */
async function checkMigrationAtomicity(): Promise<void> {
  const realDir = path.resolve(process.cwd(), 'migrations');
  const work = await mkdtemp(path.join(tmpdir(), 'sliceA-mig-'));
  const dir = path.join(work, 'migrations');
  await mkdir(dir);

  for (const f of (await readdir(realDir)).filter((f) => f.endsWith('.sql')).sort()) {
    await cp(path.join(realDir, f), path.join(dir, f));
  }
  // A valid ALTER followed by a statement that cannot succeed: if the file
  // were applied non-transactionally, `half_applied` would remain.
  await writeFile(
    path.join(dir, '004_broken.sql'),
    'ALTER TABLE llm_presets ADD COLUMN half_applied TEXT;\n' +
    'ALTER TABLE no_such_table ADD COLUMN nope TEXT;\n',
  );

  const dbPath = path.join(work, 'atomic.db');
  const client = createClient({ url: `file:${dbPath}` });
  const previous = getDb();
  setDbForTest(client);
  try {
    let threw = false;
    let message = '';
    try {
      await runMigrations(dir);
    } catch (e) {
      threw = true;
      message = e instanceof Error ? e.message : String(e);
    }
    check('failing migration throws', threw, message.slice(0, 120));

    const cols = (await client.execute('PRAGMA table_info(llm_presets)')).rows.map((r) => String(r.name));
    check('schema change from failed migration rolled back', !cols.includes('half_applied'), cols.join(','));

    const ledger = (await client.execute("SELECT id FROM _migrations WHERE id = '004_broken.sql'")).rows;
    check('no ledger row for failed migration', ledger.length === 0, `${ledger.length} row(s)`);

    // The three real migrations before it must still be applied and recorded.
    const applied = (await client.execute('SELECT id FROM _migrations ORDER BY id')).rows.map((r) => String(r.id));
    check('earlier migrations still applied', applied.length === 3 && applied.includes('003_reasoning_and_models_cache.sql'), applied.join(','));

    // And the runner retries it: removing the bad file lets the next run finish.
    await writeFile(path.join(dir, '004_broken.sql'), 'ALTER TABLE llm_presets ADD COLUMN half_applied TEXT;\n');
    const retried = await runMigrations(dir);
    check('retry after fix applies the file', retried.includes('004_broken.sql'), retried.join(','));
    const colsAfter = (await client.execute('PRAGMA table_info(llm_presets)')).rows.map((r) => String(r.name));
    check('retried migration now present', colsAfter.includes('half_applied'));
  } finally {
    setDbForTest(previous);
    client.close();
  }
}

main().catch((e) => { console.error('verify failed:', e); process.exit(1); });
