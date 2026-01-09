import '../global.css';
import '../src/i18n';
import { Stack } from 'expo-router';
import { Providers } from '../src/components/Providers';
import { StatusBar } from 'expo-status-bar';
import { View } from 'react-native';
import LanguageToggle from '../src/components/LanguageToggle';
import { useUpdates } from '../src/hooks/useUpdates';

export default function RootLayout() {
  useUpdates();

  return (
    <Providers>
      <View style={{ flex: 1 }}>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="(auth)" />
          <Stack.Screen name="(tabs)" />
        </Stack>

        <View
          style={{
            position: 'absolute',
            top: 48,
            right: 24,
            zIndex: 50,
          }}
        >
          <LanguageToggle />
        </View>
      </View>
      <StatusBar style="auto" />
    </Providers>
  );
}
