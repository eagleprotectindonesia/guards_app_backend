import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import * as Localization from 'expo-localization';
import AsyncStorage from '@react-native-async-storage/async-storage';
import 'intl-pluralrules';

import { locales } from '@repo/shared';

const { en, id } = locales;

const STORE_LANGUAGE_KEY = 'user-language';

const resources = {
  en: { translation: en },
  id: { translation: id },
};

const languageDetector: any = {
  type: 'languageDetector',
  async: true,
  init: () => {},
  detect: async (callback: (lang: string) => void) => {
    try {
      const savedLanguage = await AsyncStorage.getItem(STORE_LANGUAGE_KEY);
      if (savedLanguage) {
        return callback(savedLanguage);
      }
      
      const locales = Localization.getLocales();
      if (locales && locales.length > 0) {
        return callback(locales[0].languageCode || 'id');
      }
    } catch (error) {
      console.warn('Error reading language from storage', error);
    }
    callback('id');
  },
  cacheUserLanguage: async (language: string) => {
    try {
      await AsyncStorage.setItem(STORE_LANGUAGE_KEY, language);
    } catch (error) {
      console.warn('Error saving language to storage', error);
    }
  },
};

i18n
  .use(languageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: 'id',
    interpolation: {
      escapeValue: false,
    },
    react: {
        useSuspense: false,
    }
  });

export default i18n;
