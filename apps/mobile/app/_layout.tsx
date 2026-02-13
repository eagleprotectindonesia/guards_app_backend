import '../global.css';
import '../src/i18n';
import '../src/utils/backgroundTasks';
import { Stack } from 'expo-router';
import { Providers } from '../src/components/Providers';
import { AuthProvider } from '../src/contexts/AuthContext';
import { StatusBar } from 'expo-status-bar';
import { AppState, View } from 'react-native';
import LanguageToggle from '../src/components/LanguageToggle';
import { useUpdates } from '../src/hooks/useUpdates';
import { useEffect, useRef } from 'react';
import { storage } from '../src/utils/storage';
import { checkAndReportLocationServices } from '../src/utils/backgroundTasks';

export default function RootLayout() {
  useUpdates();
  const appState = useRef(AppState.currentState);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', async (nextAppState) => {
      if (
        appState.current.match(/inactive|background/) &&
        nextAppState === 'active'
      ) {
        console.log('[App] App has come to the foreground!');
        const activeShiftId = await storage.getItem('active_shift_id');
        if (activeShiftId) {
          // Immediate check when coming back to foreground
          await checkAndReportLocationServices(activeShiftId as string, 'APP_FOREGROUND', { immediate: true });
        }
      }

      appState.current = nextAppState;
    });

    return () => {
      subscription.remove();
    };
  }, []);

  return (
    <Providers>
      <AuthProvider>
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
      </AuthProvider>
    </Providers>
  );
}
