import { customAlphabet } from 'nanoid';

// URL-safe, no lookalikes stripped is fine for internal ids; share slugs use the
// unambiguous alphabet below.
const nanoidInternal = customAlphabet('0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz', 21);
const nanoidShare = customAlphabet('23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz', 16);

export const NANOID_LENGTH = 21;
export const SHARE_SLUG_LENGTH = 16;

export function newId(prefix?: string): string {
  const id = nanoidInternal();
  return prefix ? `${prefix}_${id}` : id;
}

export function newShareSlug(): string {
  return nanoidShare();
}

export function nowIso(): string {
  return new Date().toISOString();
}
