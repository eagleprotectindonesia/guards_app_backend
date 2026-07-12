import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { ErrorBoundary as ReactErrorBoundary } from 'react-error-boundary';
import * as Updates from 'expo-updates';
import { captureException } from '../utils/sentry';
import { useTranslation } from 'react-i18next';

function Fallback({ resetErrorBoundary }: { resetErrorBoundary: () => void }) {
  const { t } = useTranslation();

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{t('errorBoundary.title', 'Something went wrong')}</Text>
      <Text style={styles.message}>{t('errorBoundary.message', 'An unexpected error occurred. Please try again.')}</Text>
      <TouchableOpacity
        style={styles.button}
        onPress={() => Updates.reloadAsync()}
      >
        <Text style={styles.buttonText}>{t('errorBoundary.reload', 'Reload App')}</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={styles.retryButton}
        onPress={resetErrorBoundary}
      >
        <Text style={styles.retryButtonText}>{t('errorBoundary.retry', 'Retry')}</Text>
      </TouchableOpacity>
    </View>
  );
}

export function ErrorBoundary({ children }: { children: React.ReactNode }) {
  return (
    <ReactErrorBoundary
      FallbackComponent={Fallback}
      onError={(error, info) => {
        captureException(error, {
          tags: { feature: 'react_error_boundary' },
          extra: { componentStack: info.componentStack },
        });
      }}
    >
      {children}
    </ReactErrorBoundary>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    backgroundColor: '#0f172a',
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#f8fafc',
    marginBottom: 8,
  },
  message: {
    fontSize: 14,
    color: '#94a3b8',
    textAlign: 'center',
    marginBottom: 24,
  },
  button: {
    backgroundColor: '#3b82f6',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
    marginBottom: 12,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  retryButton: {
    paddingHorizontal: 24,
    paddingVertical: 12,
  },
  retryButtonText: {
    color: '#94a3b8',
    fontSize: 14,
  },
});
