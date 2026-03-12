import React, { useEffect, useState } from 'react';
import { ScrollView, Switch, Image, View, TouchableOpacity } from 'react-native';
import { Box } from '@/components/ui/box';
import { VStack } from '@/components/ui/vstack';
import { Heading } from '@/components/ui/heading';
import { Text } from '@/components/ui/text';
import { HStack } from '@/components/ui/hstack';
import { useTranslation } from 'react-i18next';
import { useRouter } from 'expo-router';
import { LogOut, Key, ChevronRight, Fingerprint } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../src/contexts/AuthContext';
import { usePasswordChangeModal } from '../../src/contexts/PasswordChangeModalContext';
import { useAlert } from '../../src/contexts/AlertContext';
import { useCustomToast } from '../../src/hooks/useCustomToast';
import {
  checkBiometricAvailability,
  getBiometricTypeLabel,
  authenticateWithBiometric,
} from '../../src/utils/biometric';
import PasswordConfirmationModal from '../../src/components/PasswordConfirmationModal';
import { LinearGradient } from 'expo-linear-gradient';
import GlassLanguageToggle from '../../src/components/GlassLanguageToggle';
import { useProfile } from '../../src/hooks/useProfile';

const DEFAULT_AVATAR =
  'https://lh3.googleusercontent.com/aida-public/AB6AXuDzcxM7B2Plj0M6rLwD5-jwCeXCJ-VxTGp8XT8dffCo7Cjv4BQ3_fM-MkOicyMU8jJxMw9Q81kjfqVm_zD_yfF92pmxUsZDY_fB7by9N3_LAOMNfdJlNjEUudjhqq7Cm5LUPTk9aKNVSgT9A4rsOYqHKU5vKRmjMZknp_AFtbKxzLh1PX2V_AKy5bez2tThvg_swnSuuvc4uRhd_JO8vfyGxuCUlrrS_Gt_LXaPHMHfgxPWTz6nvJqDPVw3QneYlTqVGg46xTuvrQDq';

export default function AccountScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { logout, isBiometricEnabled, disableBiometric, enableBiometric, user } = useAuth();
  const { openPasswordChangeModal } = usePasswordChangeModal();
  const { showAlert } = useAlert();
  const toast = useCustomToast();
  const [isBiometricAvailable, setIsBiometricAvailable] = useState(false);
  const [biometricType, setBiometricType] = useState('Biometric');
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);

  useEffect(() => {
    checkBiometricAvailability().then(({ available }) => {
      setIsBiometricAvailable(available);
      if (available) {
        getBiometricTypeLabel().then(setBiometricType);
      }
    });
  }, []);

  const { data: profile } = useProfile();

  const employee = profile?.employee;

  const handleLogout = async () => {
    await logout();
    router.replace('/(auth)/login');
  };

  const handlePasswordConfirm = async (password: string) => {
    if (!user?.id) {
      toast.error('Error', 'User information missing');
      throw new Error('User missing');
    }

    const success = await enableBiometric(user.id, password);
    if (success) {
      toast.success(t('common.successTitle', 'Success'), t('biometric.enableSuccess'));
      setIsPasswordModalOpen(false);
    } else {
      toast.error('Error', 'Failed to enable biometric. Please check your password.');
      throw new Error('Failed');
    }
  };

  const handleToggleBiometric = async (value: boolean) => {
    if (value) {
      const auth = await authenticateWithBiometric(t('biometric.promptMessage'));
      if (auth.success) {
        setIsPasswordModalOpen(true);
      }
    } else {
      showAlert(
        t('biometric.disableConfirmTitle'),
        t('biometric.disableConfirmMessage'),
        [
          { text: t('common.cancel'), style: 'cancel' },
          {
            text: t('common.confirm', 'Confirm'),
            style: 'destructive',
            onPress: async () => {
              await disableBiometric();
            },
          },
        ],
        { icon: 'warning' }
      );
    }
  };

  return (
    <Box className="flex-1 bg-[#121212] overflow-hidden">
      {/* Background Ambient Glow */}
      <Box className="absolute top-0 right-0 w-64 h-64 opacity-20">
        <LinearGradient colors={['rgba(37, 99, 235, 0.3)', 'transparent']} style={{ flex: 1, borderRadius: 128 }} />
      </Box>
      <Box className="absolute bottom-0 left-0 w-64 h-64 opacity-20">
        <LinearGradient colors={['rgba(239, 68, 68, 0.3)', 'transparent']} style={{ flex: 1, borderRadius: 128 }} />
      </Box>

      <ScrollView
        contentContainerStyle={{
          paddingBottom: 100,
          paddingTop: insets.top + 20,
        }}
        showsVerticalScrollIndicator={false}
      >
        <VStack space="xl">
          {/* Top Navigation / Language Toggle */}
          <Box className="px-6 flex-row justify-end">
            <GlassLanguageToggle />
          </Box>

          {/* Header Section */}
          <VStack space="lg" className="items-center mb-8 px-6">
            <View style={{ width: 128, height: 128, marginBottom: 8, position: 'relative' }}>
              <Box
                className="w-full h-full rounded-full p-1 border border-brand-500/30 bg-background-800"
                style={{
                  shadowColor: '#ef4444',
                  shadowOffset: { width: 0, height: 0 },
                  shadowOpacity: 0.4,
                  shadowRadius: 20,
                }}
              >
                <Box className="w-full h-full rounded-full overflow-hidden border-2 border-brand-600">
                  <Image
                    source={{ uri: DEFAULT_AVATAR }}
                    style={{ width: '100%', height: '100%' }}
                    resizeMode="cover"
                  />
                  <LinearGradient
                    colors={['rgba(255,255,255,0.1)', 'transparent']}
                    style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
                  />
                </Box>
              </Box>
              <Box className="absolute bottom-2 right-2 w-6 h-6 bg-[#181818] rounded-full items-center justify-center border border-outline-700">
                <Box
                  className="w-3 h-3 bg-emerald-500 rounded-full"
                  style={{
                    shadowColor: '#10b981',
                    shadowOffset: { width: 0, height: 0 },
                    shadowOpacity: 0.8,
                    shadowRadius: 8,
                  }}
                />
              </Box>
            </View>

            <VStack className="items-center">
              <HStack space="xs">
                <Heading size="2xl" className="text-white font-bold">
                  {employee?.fullName}
                </Heading>
              </HStack>
              <Text className="text-typography-500 font-semibold tracking-[0.5px]" size="sm">
                ID: {employee?.employeeNumber}
              </Text>

              <Box className="mt-4 px-4 py-1.5 rounded-full bg-white/5 border border-white/5">
                <Text size="2xs" className="font-bold uppercase tracking-[1.2px] text-typography-400">
                  {employee?.department || 'Security Unit'} • {employee?.jobTitle || 'Officer'}
                </Text>
              </Box>
            </VStack>
          </VStack>

          {/* Account Settings */}
          <VStack space="md" className="px-6 mb-8">
            <Text size="2xs" className="font-bold text-typography-500 uppercase tracking-[1.2px] ml-2">
              {t('account.settings', 'Account Settings')}
            </Text>

            <Box className="bg-[#1e1e1e]/40 border border-white/8 rounded-[32px] p-2">
              <VStack space="sm">
                {/* Change Password */}
                <TouchableOpacity onPress={() => openPasswordChangeModal(false)} activeOpacity={0.7}>
                  <Box className="flex-row items-center justify-between p-4 rounded-2xl bg-white/3 border border-white/5">
                    <HStack space="md" className="items-center">
                      <Box className="w-10 h-10 rounded-xl bg-blue-500/10 items-center justify-center border border-blue-500/20">
                        <Key size={20} color="#3b82f6" />
                      </Box>
                      <Text size="sm" className="font-semibold text-typography-200">
                        {t('dashboard.changePassword')}
                      </Text>
                    </HStack>
                    <ChevronRight size={16} color="#4b5563" />
                  </Box>
                </TouchableOpacity>

                {/* Biometrics */}
                {isBiometricAvailable && (
                  <Box className="flex-row items-center justify-between p-4 rounded-2xl bg-white/3 border border-white/5">
                    <HStack space="md" className="items-center">
                      <Box className="w-10 h-10 rounded-xl bg-purple-500/10 items-center justify-center border border-purple-500/20">
                        <Fingerprint size={20} color="#a855f7" />
                      </Box>
                      <VStack>
                        <Text size="sm" className="font-semibold text-typography-200">
                          {t('biometric.settingsTitle')}
                        </Text>
                        <Text className="text-typography-500 font-bold uppercase tracking-[1px]" size="2xs">
                          {biometricType}
                        </Text>
                      </VStack>
                    </HStack>
                    <Switch
                      value={isBiometricEnabled}
                      onValueChange={handleToggleBiometric}
                      trackColor={{ false: '#374151', true: '#ef4444' }}
                      thumbColor={isBiometricEnabled ? '#ffffff' : '#9ca3af'}
                    />
                  </Box>
                )}
              </VStack>
            </Box>
          </VStack>

          {/* Logout Section */}
          <Box className="px-6">
            <Box className="bg-[#1e1e1e]/40 border border-white/8 rounded-[32px] p-3">
              <TouchableOpacity
                onPress={() =>
                  showAlert(
                    t('dashboard.logoutConfirmTitle'),
                    t('dashboard.logoutConfirmMessage'),
                    [
                      { text: t('dashboard.cancel'), style: 'cancel' },
                      { text: t('dashboard.logout'), style: 'destructive', onPress: handleLogout },
                    ],
                    { icon: 'warning' }
                  )
                }
                activeOpacity={0.7}
              >
                <Box className="flex-row items-center p-4 rounded-2xl bg-white/3 border border-white/5">
                  <HStack space="md" className="items-center">
                    <Box className="w-10 h-10 rounded-xl bg-error-500/10 items-center justify-center border border-error-500/20">
                      <LogOut size={20} color="#ef4444" />
                    </Box>
                    <Text size="sm" className="font-bold text-brand-500 tracking-[0.5px]">
                      {t('dashboard.logout')}
                    </Text>
                  </HStack>
                </Box>
              </TouchableOpacity>
            </Box>

            {/* <Text
              mt="$12"
              textAlign="center"
              size="2xs"
              color="$textDark600"
              textTransform="uppercase"
              letterSpacing={1.2}
              fontWeight="$medium"
            >
              Eagle Protect v2.4.0 (Build 892)
            </Text> */}
          </Box>
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
