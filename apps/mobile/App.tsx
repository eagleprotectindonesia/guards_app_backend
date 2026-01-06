import './global.css';
import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { Providers } from './src/components/Providers';
import RootNavigator from './src/navigation/RootNavigator';

export default function App() {
  return (
    <Providers>
      <RootNavigator />
      <StatusBar style="auto" />
    </Providers>
  );
}
