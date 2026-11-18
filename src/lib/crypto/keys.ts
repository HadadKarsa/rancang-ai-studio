import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { getEnv } from '@/lib/env';

/**
 * AES-256-GCM key encryption (02_ARCHITECTURE Appendix C, 03_DATABASE §3.6).
 * Storage layout: three columns — key_iv_b64 (12-byte IV), key_tag_b64 (16-byte
 * GCM tag), encrypted_key_b64 (ciphertext). Master key: ENCRYPTION_KEY (32-byte
 * base64). Fails closed on tampered auth tag.
 */

function masterKey(): Buffer {
  const raw = getEnv().ENCRYPTION_KEY;
  const key = Buffer.from(raw, 'base64');
  if (key.length !== 32) {
    throw new Error('ENCRYPTION_KEY must decode to exactly 32 bytes (generate: openssl rand -base64 32)');
  }
  return key;
}

export interface EncryptedKey {
  encryptedKeyB64: string;
  keyIvB64: string;
  keyTagB64: string;
}

export function encryptKey(plaintext: string): EncryptedKey {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', masterKey(), iv);
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    encryptedKeyB64: enc.toString('base64'),
    keyIvB64: iv.toString('base64'),
    keyTagB64: tag.toString('base64'),
  };
}

export function decryptKey(payload: EncryptedKey): string {
  try {
    const iv = Buffer.from(payload.keyIvB64, 'base64');
    const tag = Buffer.from(payload.keyTagB64, 'base64');
    const enc = Buffer.from(payload.encryptedKeyB64, 'base64');
    const decipher = createDecipheriv('aes-256-gcm', masterKey(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8');
  } catch {
    // Fail closed: wrong master key or tampered ciphertext must never yield data.
    throw new Error('ENCRYPTION_ERROR: key decryption failed (bad master key or tampered ciphertext)');
  }
}

/** Masked UI form: `sk-...9x4B`. */
export function maskKey(plaintext: string): string {
  if (plaintext.length <= 8) return '••••';
  return `${plaintext.slice(0, 3)}...${plaintext.slice(-4)}`;
}
