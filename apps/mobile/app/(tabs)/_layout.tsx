import React, { useEffect } from 'react';
import { Tabs } from 'expo-router';
import { Home, MessageSquare, User } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { useChatUnread } from '../../src/hooks/useChatUnread';
import { useAuth } from '../../src/contexts/AuthContext';
import { View, ActivityIndicator } from 'react-native';
import PasswordChangeModal from '../../src/components/PasswordChangeModal';
import { PasswordChangeModalProvider, usePasswordChangeModal } from '../../src/contexts/PasswordChangeModalContext';
import SessionMonitor from '../../src/components/SessionMonitor';
import { useProfile } from '../../src/hooks/useProfile';

export default function TabsLayout() {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'white' }}>
        <ActivityIndicator size="large" color="#2563EB" />
      </View>
    );
  }

  return (
    <PasswordChangeModalProvider>
      <SessionMonitor />
      <TabsContent isAuthenticated={isAuthenticated} />
      <PasswordChangeManager />
    </PasswordChangeModalProvider>
  );
}

function PasswordChangeManager() {
  const { isOpen, isForce, openPasswordChangeModal, closePasswordChangeModal } = usePasswordChangeModal();

  const { data: profile } = useProfile();

  useEffect(() => {
    if (profile?.employee?.mustChangePassword) {
      const timer = setTimeout(() => {
        openPasswordChangeModal(true);
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [profile?.employee?.mustChangePassword, openPasswordChangeModal]);

  return <PasswordChangeModal isOpen={isOpen} isForce={isForce} onClose={closePasswordChangeModal} />;
}

function TabsContent({ isAuthenticated }: { isAuthenticated: boolean }) {
  const { t } = useTranslation();
  const { unreadCount } = useChatUnread();

  return (
    <View style={{ flex: 1 }}>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: '#FFFFFF',
          tabBarInactiveTintColor: '#737373',
          tabBarStyle: {
            backgroundColor: '#0A0A0A',
            borderTopColor: 'rgba(255,255,255,0.1)',
            height: 72,
            paddingBottom: 8,
            paddingTop: 8,
          },
        }}
      >
        {/* 
          We use Tabs.Protected to wrap all tabs that require authentication.
          If guard is false (not authenticated), it will redirect to the nearest unprotected route (e.g., login).
        */}
        <Tabs.Protected guard={isAuthenticated}>
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
        </Tabs.Protected>
      </Tabs>
    </View>
  );
}
