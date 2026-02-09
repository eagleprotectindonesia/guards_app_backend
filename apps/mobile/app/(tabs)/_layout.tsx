import React, { useEffect } from 'react';
import { Tabs, useRouter } from 'expo-router';
import { Home, MessageSquare, User } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { useChatUnread } from '../../src/hooks/useChatUnread';
import { setupInterceptors } from '../../src/api/client';
import { useAuth } from '../../src/contexts/AuthContext';
import { Alert, View, ActivityIndicator } from 'react-native';

export default function TabsLayout() {
  const { isAuthenticated, isLoading, logout } = useAuth();
  const { replace } = useRouter();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      replace('/(auth)/login');
    }
  }, [isLoading, isAuthenticated, replace]);

  if (isLoading || !isAuthenticated) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'white' }}>
        <ActivityIndicator size="large" color="#2563EB" />
      </View>
    );
  }

  return <TabsContent logout={logout} />;
}

function TabsContent({ logout }: { logout: (reason?: string) => Promise<void> }) {
  const { t } = useTranslation();
  const { unreadCount } = useChatUnread();

  // Setup Global Logout Interceptor once for all tab screens
  useEffect(() => {
    let isExpiring = false;

    const cleanup = setupInterceptors(async () => {
      if (isExpiring) return;
      isExpiring = true;

      Alert.alert(t('dashboard.sessionExpiredTitle'), t('dashboard.sessionExpiredMessage'), [
        {
          text: 'OK',
          onPress: async () => {
            await logout('session_expired');
            isExpiring = false;
          },
        },
      ]);
    });

    return cleanup;
  }, [logout, t]);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#2563EB',
        tabBarInactiveTintColor: '#6B7280',
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: t('tabs.home', 'Home'),
          tabBarIcon: ({ color, size }) => <Home stroke={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="chat"
        options={{
          title: t('tabs.chat', 'Chat'),
          tabBarIcon: ({ color, size }) => <MessageSquare stroke={color} size={size} />,
          tabBarBadge: unreadCount > 0 ? unreadCount : undefined,
          tabBarBadgeStyle: { backgroundColor: '#EF4444' },
        }}
      />
      <Tabs.Screen
        name="account"
        options={{
          title: t('tabs.account', 'Account'),
          tabBarIcon: ({ color, size }) => <User stroke={color} size={size} />,
        }}
      />
    </Tabs>
  );
}
