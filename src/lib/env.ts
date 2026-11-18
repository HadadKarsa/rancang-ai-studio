import { z } from 'zod';

/**
 * Zod-validated env loader (T-005). Importing `env` throws a clear error if a
 * required var is missing. AUTH_SECRET is only required in cloud mode.
 */
const schema = z.object({
  APP_URL: z.string().url().default('http://localhost:3000'),
  DATABASE_URL: z.string().min(1),
  DATABASE_AUTH_TOKEN: z.string().optional(),
  AUTH_MODE: z.enum(['local', 'cloud']).default('local'),
  AUTH_SECRET: z.string().optional(),
  ENCRYPTION_KEY: z.string().min(1),
  LOCAL_USER_EMAIL: z.string().default('owner@rancang.local'),
  LOCAL_USER_NAME: z.string().default('Local Owner'),
  RATE_LIMIT_RPM: z.coerce.number().default(60),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
});

let _env: z.infer<typeof schema> | null = null;

export function getEnv(): z.infer<typeof schema> {
  if (_env) return _env;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const missing = parsed.error.issues
      .map((i) => `${i.path.join('.')}: ${i.message}`)
      .join('; ');
    throw new Error(`Invalid environment configuration — ${missing}`);
  }
  const env = parsed.data;
  if (env.AUTH_MODE === 'cloud' && !env.AUTH_SECRET) {
    throw new Error('AUTH_SECRET is required when AUTH_MODE=cloud');
  }
  _env = env;
  return env;
}

/** Test seam. */
export function setEnvForTest(overrides: Partial<Record<string, string>>): void {
  _env = null;
  for (const [k, v] of Object.entries(overrides)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
}
