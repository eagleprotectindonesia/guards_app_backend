import AsyncStorage from '@react-native-async-storage/async-storage';

export const STORAGE_KEYS = {
  TOKEN: 'auth_token',
  EMPLOYEE_INFO: 'employee_info',
};

export const storage = {
  async setItem(key: string, value: any) {
    if (!key) {
      console.error('storage.setItem: key is undefined or null');
      return;
    }
    try {
      const stringValue = typeof value === 'string' ? value : JSON.stringify(value);
      await AsyncStorage.setItem(key, stringValue);
    } catch (e) {
      console.error('Error saving data', e);
    }
  },

  async getItem(key: string) {
    if (!key) {
      console.error('storage.getItem: key is undefined or null');
      return null;
    }
    try {
      const value = await AsyncStorage.getItem(key);
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
      await AsyncStorage.removeItem(key);
    } catch (e) {
      console.error('Error removing data', e);
    }
  },

  async clear() {
    try {
      await AsyncStorage.clear();
    } catch (e) {
      console.error('Error clearing storage', e);
    }
  },
};
