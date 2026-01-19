import crypto from 'crypto';
import { prisma } from './prisma';

/**
 * Generates a new random API key with a prefix.
 */
export function generateApiKey(): string {
  // Use a secure random string generator
  const randomPart = crypto.randomBytes(24).toString('hex');
  return `ep_${randomPart}`;
}

/**
 * Hashes an API key using SHA-256.
 * We use SHA-256 for API keys as they are high-entropy already.
 */
export function hashApiKey(key: string): string {
  return crypto.createHash('sha256').update(key).digest('hex');
}

/**
 * Validates a raw API key against a hashed one.
 */
export function validateApiKey(rawKey: string, hashedKey: string): boolean {
  if (!rawKey || !hashedKey) return false;

  const rawHash = hashApiKey(rawKey);

  // Use timing-safe comparison to prevent timing attacks
  // Although for API keys this is less critical than passwords, it's good practice.
  try {
    return crypto.timingSafeEqual(Buffer.from(rawHash, 'hex'), Buffer.from(hashedKey, 'hex'));
  } catch {
    return false;
  }
}

/**
 * Validates a raw API key against the database.
 * If valid, updates lastUsedAt.
 */
export async function validateApiKeyInDb(rawKey: string) {
  if (!rawKey || !rawKey.startsWith('ep_')) {
    return null;
  }

  const hashedKey = hashApiKey(rawKey);

  const apiKeyEntry = await prisma.apiKey.findUnique({
    where: { key: hashedKey, status: true },
  });

  if (!apiKeyEntry) {
    return null;
  }

  // Update last used timestamp in the background
  prisma.apiKey
    .update({
      where: { id: apiKeyEntry.id },
      data: { lastUsedAt: new Date() },
    })
    .catch(_err => console.error('Failed to update API key lastUsedAt:', _err));

  return apiKeyEntry;
}
