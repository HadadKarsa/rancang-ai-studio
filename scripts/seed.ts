import { getDb, applyPragmas } from '../src/lib/db/client';
import { runMigrations } from '../src/lib/db/migrate';
import { getOrCreateLocalUser } from '../src/lib/db/repositories/users';
import { createTemplate, getTemplateBySlug } from '../src/lib/db/repositories/templates';
import { createPreset, getDefaultPreset } from '../src/lib/db/repositories/credentials';
import { createTag } from '../src/lib/db/repositories/templates';
import type { TemplateCategory } from '../src/lib/db/enums';

/**
 * Idempotent seed (T-113): local user, 4 system templates, 3 default presets,
 * 3 default tags. Uses lookup-before-insert; INSERT OR IGNORE at the SQL layer
 * where a unique index exists.
 */
const SYSTEM_TEMPLATES: {
  slug: string; name: string; description: string; category: TemplateCategory; icon: string; accentColor: string;
  baselineAssumptions: string[]; defaultQuestions: string[];
}[] = [
  {
    slug: 'b2b-micro-saas', name: 'B2B Micro-SaaS',
    description: 'A focused B2B tool sold to small teams. Subscription billing, multi-tenant orgs, admin dashboard.',
    category: 'saas', icon: 'Building2', accentColor: '#6366f1',
    baselineAssumptions: ['B2B SMB teams', 'Stripe subscription billing', 'Multi-tenant orgs', 'Email + Google OAuth'],
    defaultQuestions: [
      'Who is the exact buyer role and what is their daily pain?',
      'What is the one workflow this product must nail first?',
      'How do teams get value within the first 10 minutes?',
      'What is the pricing anchor and why?',
    ],
  },
  {
    slug: 'mobile-marketplace', name: 'Mobile Marketplace',
    description: 'Two-sided mobile marketplace with listings, search, chat, payments, and reviews.',
    category: 'marketplace', icon: 'Store', accentColor: '#ec4899',
    baselineAssumptions: ['iOS + Android', 'Buyers + sellers', 'In-app + escrow payments', 'Reviews + verification'],
    defaultQuestions: [
      'Who are the two sides and which side is harder to acquire?',
      'What is the core transaction loop end-to-end?',
      'What trust signal is non-negotiable at launch?',
      'How do you monetize the first 100 transactions?',
    ],
  },
  {
    slug: 'ai-agent-tool', name: 'AI Agent Tool',
    description: 'An AI-powered tool with prompt orchestration, tool-calling, streaming output, and usage metering.',
    category: 'ai', icon: 'Sparkles', accentColor: '#8b5cf6',
    baselineAssumptions: ['Streaming via Vercel AI SDK', 'Function calling tools', 'Per-token usage metering', 'Input/output moderation'],
    defaultQuestions: [
      'What is the single task the agent must do better than a human?',
      'Which model tier (fast vs. smart) is the default and why?',
      'How is usage metered and billed?',
      'What happens when the model fails or hallucinates?',
    ],
  },
  {
    slug: 'internal-ops-dashboard', name: 'Internal Ops Dashboard',
    description: 'An internal tool for a small team: CRUD screens, role-based access, workflow automation, audit log.',
    category: 'internal', icon: 'LayoutDashboard', accentColor: '#0ea5e9',
    baselineAssumptions: ['Internal staff only', 'SSO or magic link auth', '1 team, 5-30 seats', 'Replace spreadsheets'],
    defaultQuestions: [
      'Which spreadsheet or manual process is this replacing?',
      'Who are the 3 user roles and their permissions?',
      'What is the highest-frequency action per day?',
      'What audit trail is required?',
    ],
  },
];

async function main() {
  await runMigrations();
  const user = await getOrCreateLocalUser();
  console.log(`local user: ${user.email} (${user.id})`);

  for (const t of SYSTEM_TEMPLATES) {
    const existing = await getTemplateBySlug(t.slug);
    if (existing) continue;
    await createTemplate({
      userId: user.id, name: t.name, description: t.description, category: t.category,
      icon: t.icon, accentColor: t.accentColor,
      baselineAssumptions: t.baselineAssumptions, defaultQuestions: t.defaultQuestions,
    });
    console.log(`template seeded: ${t.slug}`);
  }

  if (!(await getDefaultPreset(user.id))) {
    await createPreset({
      userId: user.id, name: 'DeepSeek V3 – Budget Specs',
      description: 'Fast, cheap drafts for all 7 documents.',
      provider: 'custom', modelId: 'deepseek-chat', temperature: 0.7, maxTokens: 8192,
      systemPersona: 'You are a senior product architect. Be concise, opinionated, and production-grade.',
      isDefault: true,
    });
    console.log('preset seeded: deepseek-chat (default)');
  }

  for (const tagName of ['Client Work', 'Experiment', 'Shipped']) {
    const tags = await (await import('../src/lib/db/repositories/templates')).listTagsForUser(user.id);
    if (!tags.some((t) => t.name === tagName)) {
      await createTag(user.id, tagName);
      console.log(`tag seeded: ${tagName}`);
    }
  }

  console.log('seed complete');
  const db = getDb();
  await applyPragmas(db);
}

main().catch((err) => {
  console.error('seed failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
