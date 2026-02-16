import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';

export const STORAGE_KEYS = {
  USER_TOKEN: 'user_token',
  USER_INFO: 'user_info',
  SAVED_EMPLOYEE_ID: 'saved_employee_id',
  BIOMETRIC_ENABLED: 'biometric_enabled',
  BIOMETRIC_TOKEN: 'biometric_token',
  // SAVED_PASSWORD removed for security
};

const SECURE_KEYS = [
  STORAGE_KEYS.USER_TOKEN,
  STORAGE_KEYS.SAVED_EMPLOYEE_ID,
  STORAGE_KEYS.BIOMETRIC_TOKEN,
];

export const storage = {
  async setItem(key: string, value: any): Promise<boolean> {
    if (!key) {
      console.error('storage.setItem: key is undefined or null');
      return false;
    }
    try {
      const stringValue = typeof value === 'string' ? value : JSON.stringify(value);
      
      if (SECURE_KEYS.includes(key)) {
        await SecureStore.setItemAsync(key, stringValue);
        // Also remove from AsyncStorage just in case it was there before
        await AsyncStorage.removeItem(key);
      } else {
        await AsyncStorage.setItem(key, stringValue);
      }
      return true;
    } catch (e) {
      console.error('Error saving data', e);
      return false;
    }
  },

  async getItem(key: string) {
    if (!key) {
      console.error('storage.getItem: key is undefined or null');
      return null;
    }
    try {
      let value: string | null = null;
      
      if (SECURE_KEYS.includes(key)) {
        value = await SecureStore.getItemAsync(key);
        
        // Silent migration: if not in SecureStore, check AsyncStorage
        if (value === null) {
          const oldValue = await AsyncStorage.getItem(key);
          if (oldValue !== null) {
            console.log(`[Storage] Migrating ${key} to SecureStore`);
            await SecureStore.setItemAsync(key, oldValue);
            await AsyncStorage.removeItem(key);
            value = oldValue;
          }
        }
      } else {
        value = await AsyncStorage.getItem(key);
      }

      if (value === null) return null;
      
      try {
        return JSON.parse(value);
      } catch {
        return value;
      }
    } catch (e) {
      console.error('Error reading data', e);
      return null;
    }
  },

  async removeItem(key: string) {
    if (!key) {
      console.error('storage.removeItem: key is undefined or null');
      return;
    }
    try {
      if (SECURE_KEYS.includes(key)) {
        await SecureStore.deleteItemAsync(key);
      }
      await AsyncStorage.removeItem(key);
    } catch (e) {
      console.error('Error removing data', e);
    }
  },

  async clear() {
    try {
      await AsyncStorage.clear();
      for (const key of SECURE_KEYS) {
        await SecureStore.deleteItemAsync(key);
      }
    } catch (e) {
      console.error('Error clearing storage', e);
    }
  },
};
