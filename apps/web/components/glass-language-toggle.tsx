'use client';

import React from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';

export function GlassLanguageToggle() {
  const { i18n } = useTranslation();

  const toggleLanguage = () => {
    const newLang = i18n.language === 'id' ? 'en' : 'id';
    i18n.changeLanguage(newLang);
  };

  return (
    <button
      onClick={toggleLanguage}
      className="backdrop-blur-md bg-white/10 dark:bg-black/20 border border-white/10 dark:border-white/5 rounded-full overflow-hidden transition-all active:scale-95 group"
    >
      <div className="flex items-center px-4 py-2 gap-2 text-xs font-semibold tracking-wider">
        <span className={cn('transition-colors duration-200', i18n.language === 'en' ? 'text-white' : 'text-gray-500')}>
          EN
        </span>
        <div className="w-[1px] h-3 bg-gray-700/50" />
        <span className={cn('transition-colors duration-200', i18n.language === 'id' ? 'text-white' : 'text-gray-500')}>
          ID
        </span>
      </div>
    </button>
  );
}
