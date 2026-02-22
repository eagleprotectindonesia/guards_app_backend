import React from 'react';
import { GluestackUIProvider } from '@gluestack-ui/themed';
import { config } from '@gluestack-ui/config'; // Use default config or create one
import { QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { queryClient } from '../api/client';
import { AlertProvider } from '../contexts/AlertContext';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SafeAreaProvider>
      <KeyboardProvider>
        <QueryClientProvider client={queryClient}>
          <GluestackUIProvider config={config}>
            <AlertProvider>{children}</AlertProvider>
          </GluestackUIProvider>
        </QueryClientProvider>
      </KeyboardProvider>
    </SafeAreaProvider>
  );
}
