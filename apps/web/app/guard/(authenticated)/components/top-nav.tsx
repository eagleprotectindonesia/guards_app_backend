'use client';

import { useTranslation } from 'react-i18next';
import { Languages } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function TopNav() {
  const { i18n } = useTranslation();

  const toggleLanguage = () => {
    const newLang = i18n.language === 'id' ? 'en' : 'id';
    i18n.changeLanguage(newLang);
  };

  return (
    <header className="sticky top-0 left-0 right-0 bg-white/80 backdrop-blur-md border-b border-gray-100 z-40 px-6 py-3 flex justify-between items-center">
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
          <span className="text-white font-bold text-sm">EP</span>
        </div>
        <span className="font-bold text-gray-900 tracking-tight">GUARD</span>
      </div>

      <Button
        variant="ghost"
        size="sm"
        onClick={toggleLanguage}
        className="flex items-center gap-2 text-gray-600 hover:text-blue-600 hover:bg-blue-50 transition-colors"
      >
        <Languages className="h-4 w-4" />
        <span className="text-xs font-bold uppercase">
          {i18n.language === 'id' ? 'ID' : 'EN'}
        </span>
      </Button>
    </header>
  );
}
