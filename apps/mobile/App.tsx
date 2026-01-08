import './global.css';
import './src/i18n'; // Initialize i18n
import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { enableScreens } from 'react-native-screens';
import { Providers } from './src/components/Providers';
import RootNavigator from './src/navigation/RootNavigator';

enableScreens();

export default function App() {
  return (
    <Providers>
      <RootNavigator />
      <StatusBar style="auto" />
    </Providers>
  );
}
