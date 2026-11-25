import type { ProviderId } from '@/lib/db/enums';

/**
 * A saved credential is bound to the provider and endpoint it was stored with.
 * Refreshing its model list must test THAT credential, not whatever the request
 * body happens to name: otherwise a caller can point a stored key at another
 * provider or at an endpoint of their choosing and have the key sent there.
 *
 * These are pure so the rule is checkable without a database, a key or a socket.
 */

export interface StoredCredentialTarget {
  provider: ProviderId;
  baseUrl: string | null;
}

export interface RequestedTarget {
  provider?: ProviderId | null;
  baseUrl?: string | null;
}

export type BindingResult =
  | { ok: true; provider: ProviderId; baseUrl: string | null }
  | { ok: false; reason: string };

/** Compare endpoints the way a URL is compared: case-insensitive host, no trailing slash. */
export function normalizeEndpoint(url: string | null | undefined): string | null {
  if (!url) return null;
  const trimmed = url.trim();
  if (trimmed.length === 0) return null;
  return trimmed.replace(/\/+$/, '').toLowerCase();
}

/**
 * Decide which provider and endpoint a refresh may use.
 *
 * A field the caller left out is not a conflict — the stored value is used.
 * A field the caller set to something the credential does not hold is a
 * conflict, and it is rejected here, before any decryption or network call.
 */
export function bindToStoredCredential(
  stored: StoredCredentialTarget,
  requested: RequestedTarget,
): BindingResult {
  if (requested.provider && requested.provider !== stored.provider) {
    return {
      ok: false,
      reason: `Credential belongs to provider ${stored.provider}, not ${requested.provider}`,
    };
  }

  const requestedEndpoint = normalizeEndpoint(requested.baseUrl);
  const storedEndpoint = normalizeEndpoint(stored.baseUrl);
  if (requestedEndpoint !== null && requestedEndpoint !== storedEndpoint) {
    return {
      ok: false,
      reason: 'Credential is bound to a different base URL than the one requested',
    };
  }

  return { ok: true, provider: stored.provider, baseUrl: stored.baseUrl };
}

/**
 * The model list a provider returned, as it is stored: trimmed, without the
 * `models/` prefix Google puts on ids, without empties and without duplicates.
 * Order is the provider's, so a UI can show it as sent.
 */
export function normalizeModelList(models: readonly unknown[] | null | undefined): string[] {
  if (!models) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const entry of models) {
    if (typeof entry !== 'string') continue;
    const id = entry.trim().replace(/^models\//, '');
    if (id.length === 0 || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}
