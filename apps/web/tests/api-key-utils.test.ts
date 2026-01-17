import { generateApiKey, hashApiKey, validateApiKey } from '@/lib/api-key';

// Mock prisma to prevent open database handles during utility tests
jest.mock('@/lib/prisma', () => ({
  prisma: {
    apiKey: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  },
}));

describe('API Key Utilities', () => {
  describe('generateApiKey', () => {
    test('generates a key with the correct prefix and length', () => {
      const key = generateApiKey();
      expect(key).toMatch(/^ep_/);
      // ep_ (3) + 32 chars = 35
      expect(key.length).toBeGreaterThan(30);
    });

    test('generates unique keys', () => {
      const key1 = generateApiKey();
      const key2 = generateApiKey();
      expect(key1).not.toBe(key2);
    });
  });

  describe('hashApiKey and validateApiKey', () => {
    test('hashes a key and validates it correctly', () => {
      const rawKey = 'ep_test_key_123';
      const hashed = hashApiKey(rawKey);
      
      expect(hashed).not.toBe(rawKey);
      expect(validateApiKey(rawKey, hashed)).toBe(true);
    });

    test('fails validation for incorrect key', () => {
      const rawKey = 'ep_correct_key';
      const hashed = hashApiKey(rawKey);
      
      expect(validateApiKey('ep_wrong_key', hashed)).toBe(false);
    });

    test('hashes are different for different keys', () => {
      const hash1 = hashApiKey('key1');
      const hash2 = hashApiKey('key2');
      expect(hash1).not.toBe(hash2);
    });
  });
});