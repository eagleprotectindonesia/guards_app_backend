import React from 'react';
import { StyleSheet, View, Text, Pressable } from 'react-native';
import { BlurView } from 'expo-blur';
import { useTranslation } from 'react-i18next';
import * as Haptics from 'expo-haptics';

interface GlassLanguageToggleProps {
  style?: any;
}

export default function GlassLanguageToggle({ style }: GlassLanguageToggleProps) {
  const { i18n } = useTranslation();

  const toggleLanguage = () => {
    const newLang = i18n.language === 'id' ? 'en' : 'id';
    i18n.changeLanguage(newLang);
    Haptics.selectionAsync();
  };

  return (
    <BlurView intensity={20} style={[styles.languageBlur, style]}>
      <Pressable onPress={toggleLanguage} style={styles.languageContent}>
        <Text style={[styles.langText, i18n.language === 'en' && styles.langActive]}>EN</Text>
        <View style={styles.langDivider} />
        <Text style={[styles.langText, i18n.language === 'id' && styles.langActive]}>ID</Text>
      </Pressable>
    </BlurView>
  );
}

const styles = StyleSheet.create({
  languageBlur: {
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  languageContent: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  langText: {
    fontSize: 12,
    color: '#4B5563',
    fontWeight: '500',
  },
  langActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  langDivider: {
    width: 1,
    height: 10,
    backgroundColor: '#374151',
    marginHorizontal: 8,
  },
});
