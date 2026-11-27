#!/usr/bin/env node
/**
 * Set or update the local Admin (role = 'owner') email and scrypt password in SQLite.
 * Usage:
 *   ./node_modules/.bin/dotenv -e .env.local -- node scripts/set-admin-password.mjs --password "your-strong-password"
 *   ./node_modules/.bin/dotenv -e .env.local -- node scripts/set-admin-password.mjs --email admin@yourdomain.com --password "your-strong-password"
 */
import { randomBytes, scrypt } from 'node:crypto';
import { promisify } from 'node:util';
import { createClient } from '@libsql/client';

const scryptAsync = promisify(scrypt);

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--email' && argv[i + 1]) {
      out.email = argv[++i];
    } else if (arg === '--password' && argv[i + 1]) {
      out.password = argv[++i];
    } else if (arg === '--name' && argv[i + 1]) {
      out.name = argv[++i];
    }
  }
  return out;
}

async function hashPassword(password) {
  const salt = randomBytes(16);
  const hash = await scryptAsync(password, salt, 32);
  return `scrypt$${salt.toString('base64')}$${hash.toString('base64')}`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error('DATABASE_URL is not set. Run with dotenv -e .env.local.');
    process.exit(1);
  }
  const password = args.password?.trim() ?? '';
  if (password.length < 8) {
    console.error('Usage: node scripts/set-admin-password.mjs [--email <email>] [--name <name>] --password <min 8 chars>');
    process.exit(1);
  }

  const targetEmail = (args.email || process.env.LOCAL_USER_EMAIL || 'owner@rancang.local').trim().toLowerCase();
  const targetName = (args.name || process.env.LOCAL_USER_NAME || 'Local Owner').trim();
  const hash = await hashPassword(password);
  const now = new Date().toISOString();

  const client = createClient({
    url: dbUrl,
    authToken: process.env.DATABASE_AUTH_TOKEN || undefined,
  });

  const existingOwner = await client.execute("SELECT id, email FROM users WHERE role = 'owner' ORDER BY created_at ASC LIMIT 1");
  if (existingOwner.rows.length > 0) {
    const ownerId = String(existingOwner.rows[0].id);
    const currentEmail = String(existingOwner.rows[0].email);
    await client.execute({
      sql: 'UPDATE users SET email = ?, name = COALESCE(?, name), password_hash = ?, updated_at = ? WHERE id = ?',
      args: [targetEmail, args.name ? targetName : null, hash, now, ownerId],
    });
    console.log(`Updated owner account (${ownerId}): email=${targetEmail} (previous=${currentEmail})`);
  } else {
    const id = `usr_${randomBytes(10).toString('hex')}`;
    const setId = `set_${randomBytes(10).toString('hex')}`;
    await client.execute({
      sql: `INSERT INTO users (id, email, name, role, auth_provider, password_hash, created_at, updated_at)
            VALUES (?, ?, ?, 'owner', 'local', ?, ?, ?)`,
      args: [id, targetEmail, targetName, hash, now, now],
    });
    await client.execute({
      sql: `INSERT INTO user_settings (id, user_id, theme, save_keys_to_disk, editor_font_size, onboarding_completed, created_at, updated_at)
            VALUES (?, ?, 'system', 1, 14, 0, ?, ?)`,
      args: [setId, id, now, now],
    });
    console.log(`Created owner account (${id}): email=${targetEmail}`);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
