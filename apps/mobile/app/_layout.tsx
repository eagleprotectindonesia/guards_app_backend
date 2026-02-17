import '../global.css';
import '../src/i18n';
import '../src/utils/backgroundTasks';
import { Stack } from 'expo-router';
import { Providers } from '../src/components/Providers';
import { AuthProvider } from '../src/contexts/AuthContext';
import { StatusBar } from 'expo-status-bar';
import { AppState } from 'react-native';
import { useUpdates } from '../src/hooks/useUpdates';
import { useEffect, useRef } from 'react';
import { storage } from '../src/utils/storage';
import { checkAndReportLocationServices } from '../src/utils/backgroundTasks';

export default function RootLayout() {
  useUpdates();
  const appState = useRef(AppState.currentState);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', async nextAppState => {
      if (appState.current.match(/inactive|background/) && nextAppState === 'active') {
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
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="(auth)" />
          <Stack.Screen name="(tabs)" />
        </Stack>
        <StatusBar style="light" />
      </AuthProvider>
    </Providers>
  );
}
