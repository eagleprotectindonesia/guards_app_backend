import React from 'react';
import { Alert, ScrollView, Switch } from 'react-native';
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
import { useTranslation } from 'react-i18next';
import { useRouter } from 'expo-router';
import { LogOut, Lock } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../src/contexts/AuthContext';
import { usePasswordChangeModal } from '../../src/contexts/PasswordChangeModalContext';
import {
  checkBiometricAvailability,
  getBiometricTypeLabel,
  authenticateWithBiometric,
} from '../../src/utils/biometric';
import { Fingerprint } from 'lucide-react-native';

import PasswordConfirmationModal from '../../src/components/PasswordConfirmationModal';

export default function AccountScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { logout, isBiometricEnabled, disableBiometric, enableBiometric, user } = useAuth();
  const { openPasswordChangeModal } = usePasswordChangeModal();
  const [isBiometricAvailable, setIsBiometricAvailable] = React.useState(false);
  const [biometricType, setBiometricType] = React.useState('Biometric');
  const [isPasswordModalOpen, setIsPasswordModalOpen] = React.useState(false);

  React.useEffect(() => {
    checkBiometricAvailability().then(({ available }) => {
      setIsBiometricAvailable(available);
      if (available) {
        getBiometricTypeLabel().then(setBiometricType);
      }
    });
  }, []);

  const { data: profile } = useQuery({
    queryKey: ['profile'],
    queryFn: async () => {
      const res = await client.get('/api/employee/my/profile');
      return res.data;
    },
  });

  const handleLogout = async () => {
    await logout();
    router.replace('/(auth)/login');
  };

  const handlePasswordConfirm = async (password: string) => {
    if (!user?.id) {
      Alert.alert('Error', 'User information missing');
      throw new Error('User missing');
    }

    const success = await enableBiometric(user.id, password);
    if (success) {
      Alert.alert(t('common.successTitle', 'Success'), t('biometric.enableSuccess'));
      setIsPasswordModalOpen(false);
    } else {
      Alert.alert('Error', 'Failed to enable biometric. Please check your password.');
      throw new Error('Failed');
    }
  };

  const handleToggleBiometric = async (value: boolean) => {
    if (value) {
      // 1. Verify Biometric First
      const auth = await authenticateWithBiometric(t('biometric.promptMessage'));
      if (auth.success) {
        // 2. Prompt for Password to Enable
        setIsPasswordModalOpen(true);
      }
    } else {
      Alert.alert(t('biometric.disableConfirmTitle'), t('biometric.disableConfirmMessage'), [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.confirm', 'Confirm'),
          style: 'destructive',
          onPress: async () => {
            await disableBiometric();
          },
        },
      ]);
    }
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
                onPress={() => openPasswordChangeModal(false)}
              >
                <Lock size={20} stroke="#4B5563" />
                <ButtonText className="text-gray-700 ml-3">{t('dashboard.changePassword')}</ButtonText>
              </Button>

              {isBiometricAvailable && (
                <Box className="flex-row items-center justify-between h-16 px-4 border-b border-gray-100">
                  <Box className="flex-row items-center">
                    <Fingerprint size={20} stroke="#4B5563" />
                    <VStack className="ml-3">
                      <Text className="text-gray-700 font-medium">{t('biometric.settingsTitle')}</Text>
                      <Text className="text-gray-400 text-xs">{biometricType}</Text>
                    </VStack>
                  </Box>
                  <Switch
                    value={isBiometricEnabled}
                    onValueChange={handleToggleBiometric}
                    trackColor={{ false: '#D1D5DB', true: '#E6392D' }}
                  />
                </Box>
              )}

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

      <PasswordConfirmationModal
        isOpen={isPasswordModalOpen}
        onClose={() => setIsPasswordModalOpen(false)}
        onConfirm={handlePasswordConfirm}
      />
    </Box>
  );
}
