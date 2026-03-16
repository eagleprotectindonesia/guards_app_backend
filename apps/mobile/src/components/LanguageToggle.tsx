import React from 'react';
import { Button, ButtonIcon } from '@/components/ui/button';
import { useTranslation } from 'react-i18next';
import { Languages } from 'lucide-react-native';

interface LanguageToggleProps {
  className?: string;
}

export default function LanguageToggle({ className }: LanguageToggleProps) {
  const { i18n } = useTranslation();

  const toggleLanguage = () => {
    const newLang = i18n.language === 'id' ? 'en' : 'id';
    i18n.changeLanguage(newLang);
  };

  return (
    <Button
      size="md"
      variant="outline"
      action="secondary"
      onPress={toggleLanguage}
      className={`rounded-full bg-white border-outline-300 w-10 h-10 p-0 items-center justify-center ${className}`}
    >
      <ButtonIcon as={Languages} size="md" className="text-typography-600" />
    </Button>
  );
}

