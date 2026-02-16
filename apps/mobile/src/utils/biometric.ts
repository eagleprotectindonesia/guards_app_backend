import * as LocalAuthentication from 'expo-local-authentication';

/**
 * Checks if the device has biometric hardware and if the user has enrolled any biometrics.
 */
export const checkBiometricAvailability = async () => {
  try {
    const hasHardware = await LocalAuthentication.hasHardwareAsync();
    if (!hasHardware) {
      return { available: false, error: 'no_hardware' };
    }

    const isEnrolled = await LocalAuthentication.isEnrolledAsync();
    if (!isEnrolled) {
      return { available: false, error: 'not_enrolled' };
    }

    const supportedTypes = await LocalAuthentication.supportedAuthenticationTypesAsync();
    
    return { 
      available: true, 
      types: supportedTypes 
    };
  } catch (error) {
    console.error('[Biometric] Availability check failed:', error);
    return { available: false, error: 'unknown' };
  }
};

/**
 * Triggers the biometric authentication prompt.
 */
export const authenticateWithBiometric = async (promptMessage: string) => {
  try {
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage,
      fallbackLabel: 'Use Password',
      cancelLabel: 'Cancel',
      disableDeviceFallback: true, // Enforce biometric only, no PIN/Pattern fallback
    });

    if (result.success) {
      return { success: true };
    }

    if (result.error === 'user_cancel' || result.error === 'app_cancel') {
      return { success: false, error: 'cancelled' };
    }

    return { success: false, error: result.error || 'failed' };
  } catch (error) {
    console.error('[Biometric] Authentication error:', error);
    return { success: false, error: 'unknown' };
  }
};

/**
 * Gets the preferred biometric type label based on hardware.
 */
export const getBiometricTypeLabel = async () => {
  try {
    const types = await LocalAuthentication.supportedAuthenticationTypesAsync();
    if (types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) {
      return 'Face ID / Face Unlock';
    }
    if (types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) {
      return 'Fingerprint';
    }
    if (types.includes(LocalAuthentication.AuthenticationType.IRIS)) {
      return 'Iris Scan';
    }
    return 'Biometric';
  } catch {
    return 'Biometric';
  }
};
