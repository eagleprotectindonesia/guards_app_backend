import React, { useState, useEffect } from 'react';
import { Alert, ScrollView } from 'react-native';
import {
  Box,
  VStack,
  Heading,
  Text,
  Button,
  ButtonText,
  Avatar,
  AvatarFallbackText,
  Center,
} from '@gluestack-ui/themed';
import { useQuery } from '@tanstack/react-query';
import { client } from '../../src/api/client';
import PasswordChangeModal from '../../src/components/PasswordChangeModal';
import { useTranslation } from 'react-i18next';
import { useRouter } from 'expo-router';
import { LogOut, Lock } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../src/contexts/AuthContext';

export default function AccountScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { logout } = useAuth();
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);
  const [isForcePasswordChange, setIsForcePasswordChange] = useState(false);

  const { data: profile } = useQuery({
    queryKey: ['profile'],
    queryFn: async () => {
      const res = await client.get('/api/employee/my/profile');
      return res.data;
    },
  });

  useEffect(() => {
    if (profile?.employee?.mustChangePassword) {
      // Use a small timeout to avoid synchronous set state in effect warning
      // or simply rely on the fact that this should only happen once
      const timer = setTimeout(() => {
        setIsForcePasswordChange(true);
        setIsPasswordModalOpen(true);
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [profile?.employee?.mustChangePassword]);

  const handleLogout = async () => {
    await logout();
    router.replace('/(auth)/login');
  };

  return (
    <Box className="flex-1 bg-gray-50">
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: 20,
          paddingTop: insets.top + 60,
          paddingBottom: 20,
        }}
      >
        <VStack space="2xl">
          <Heading size="2xl">{t('account.title', 'Account')}</Heading>

          <Center className="bg-white p-6 rounded-2xl shadow-sm">
            <Avatar size="2xl" bgColor="$blue600" className="mb-4">
              <AvatarFallbackText>{profile?.employee?.name || 'G'}</AvatarFallbackText>
            </Avatar>
            <Heading size="lg">{profile?.employee?.name}</Heading>
            <Text className="text-gray-500">{profile?.employee?.employeeCode}</Text>
          </Center>

          <VStack space="md">
            <Text className="text-gray-500 font-bold px-1">{t('account.settings', 'Settings')}</Text>

            <Box className="bg-white rounded-xl shadow-sm overflow-hidden">
              <Button
                variant="link"
                className="justify-start h-16 px-4 border-b border-gray-100"
                onPress={() => setIsPasswordModalOpen(true)}
              >
                <Lock size={20} stroke="#4B5563" />
                <ButtonText className="text-gray-700 ml-3">{t('dashboard.changePassword')}</ButtonText>
              </Button>

              <Button
                variant="link"
                className="justify-start h-16 px-4"
                onPress={() =>
                  Alert.alert(t('dashboard.logoutConfirmTitle'), t('dashboard.logoutConfirmMessage'), [
                    { text: t('dashboard.cancel'), style: 'cancel' },
                    { text: t('dashboard.logout'), style: 'destructive', onPress: handleLogout },
                  ])
                }
              >
                <LogOut size={20} stroke="#EF4444" />
                <ButtonText className="text-red-500 ml-3">{t('dashboard.logout')}</ButtonText>
              </Button>
            </Box>
          </VStack>
        </VStack>
      </ScrollView>

      <PasswordChangeModal
        isOpen={isPasswordModalOpen}
        isForce={isForcePasswordChange}
        onClose={() => {
          setIsPasswordModalOpen(false);
          setIsForcePasswordChange(false);
        }}
      />
    </Box>
  );
}
