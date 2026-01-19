import { generate2FASecret, generateQRCode, verify2FAToken } from '@/lib/auth/2fa';
import { generate } from 'otplib';

describe('2FA Utilities', () => {
  describe('generate2FASecret', () => {
    test('generates a secret string', () => {
      const secret = generate2FASecret();
      expect(typeof secret).toBe('string');
      // otplib v13 defaults to 20 bytes which is 32 chars in base32
      expect(secret.length).toBeGreaterThanOrEqual(26); 
    });

    test('generates unique secrets', () => {
      const secret1 = generate2FASecret();
      const secret2 = generate2FASecret();
      expect(secret1).not.toBe(secret2);
    });
  });

  describe('generateQRCode', () => {
    test('generates a data URL for the QR code', async () => {
      const email = 'admin@example.com';
      const secret = generate2FASecret();
      const qrCode = await generateQRCode(email, secret);
      
      expect(qrCode).toMatch(/^data:image\/png;base64,/);
    });
  });

  describe('verify2FAToken', () => {
    test('validates a correct token', async () => {
      const secret = generate2FASecret();
      const token = await generate({ secret });
      const isValid = await verify2FAToken(token, secret);
      expect(isValid).toBe(true);
    });

    test('rejects an incorrect token', async () => {
      const secret = generate2FASecret();
      const isValid = await verify2FAToken('000000', secret);
      expect(isValid).toBe(false);
    });

    test('rejects an invalid format token', async () => {
      const secret = generate2FASecret();
      const isValid = await verify2FAToken('abc', secret);
      expect(isValid).toBe(false);
    });
  });
});