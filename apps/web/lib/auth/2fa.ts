import { generateSecret, generateURI, verify } from 'otplib';
import QRCode from 'qrcode';

/**
 * Generates a new TOTP secret for an admin.
 */
export function generate2FASecret(): string {
  return generateSecret();
}

/**
 * Generates a QR code data URL for the admin to scan.
 * @param email The admin's email address
 * @param secret The TOTP secret
 */
export async function generateQRCode(email: string, secret: string): Promise<string> {
  const otpauth = generateURI({
    issuer: 'EP Guard Scheduling',
    label: email,
    secret,
  });
  return QRCode.toDataURL(otpauth);
}

/**
 * Verifies a 6-digit TOTP token against a secret.
 * @param token The 6-digit token from the admin
 * @param secret The admin's TOTP secret
 */
export async function verify2FAToken(token: string, secret: string): Promise<boolean> {
  if (!token || token.length !== 6 || !/^\d+$/.test(token)) {
    return false;
  }
  
  try {
    const result = await verify({ token, secret });
    return result.valid;
  } catch (error) {
    console.error('[2FA] Token verification error:', error);
    return false;
  }
}