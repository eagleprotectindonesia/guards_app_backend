import React from 'react';
import { Tabs } from 'expo-router';
import { Home, MessageSquare, User } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { useChatUnread } from '../../src/hooks/useChatUnread';

export default function TabsLayout() {
  const { t } = useTranslation();
  const { unreadCount } = useChatUnread();

  return (
    <Tabs screenOptions={{ 
      headerShown: false,
      tabBarActiveTintColor: '#2563EB',
      tabBarInactiveTintColor: '#6B7280',
    }}>
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
