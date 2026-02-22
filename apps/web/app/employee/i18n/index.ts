import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import { locales } from '@repo/shared';

const { en, id } = locales;

const resources = {
  en: { translation: en },
  id: { translation: id },
};

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: 'id',
    interpolation: {
      escapeValue: false,
    },
    detection: {
      order: ['localStorage', 'navigator'],
      caches: ['localStorage'],
      lookupLocalStorage: 'user-language',
    },
    react: {
      useSuspense: false,
    },
  });

export default i18n;
