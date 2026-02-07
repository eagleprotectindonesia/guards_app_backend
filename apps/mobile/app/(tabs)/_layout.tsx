import React, { useEffect } from 'react';
import { Tabs, useRouter } from 'expo-router';
import { Home, MessageSquare, User } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { useChatUnread } from '../../src/hooks/useChatUnread';
import { setupInterceptors } from '../../src/api/client';
import { disconnectSocket } from '../../src/api/socket';
import { storage } from '../../src/utils/storage';
import { Alert } from 'react-native';

export default function TabsLayout() {
  const { t } = useTranslation();
  const { replace } = useRouter();
  const { unreadCount } = useChatUnread();

  // Setup Global Logout Interceptor once for all tab screens
  useEffect(() => {
    let isExpiring = false;

    const cleanup = setupInterceptors(async () => {
      if (isExpiring) return;
      isExpiring = true;

      // Close socket connection on unauthorized
      disconnectSocket();
      await storage.clear();

      Alert.alert(t('dashboard.sessionExpiredTitle'), t('dashboard.sessionExpiredMessage'), [
        {
          text: 'OK',
          onPress: () => {
            isExpiring = false;
            replace('/(auth)/login');
          },
        },
      ]);
    });

    return cleanup;
  }, [replace, t]);

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
