import React, { useEffect, useState } from 'react';
import { ScrollView, Switch, Image, View, TouchableOpacity } from 'react-native';
import { Box } from '@/components/ui/box';
import { VStack } from '@/components/ui/vstack';
import { Heading } from '@/components/ui/heading';
import { Text } from '@/components/ui/text';
import { HStack } from '@/components/ui/hstack';
import { useTranslation } from 'react-i18next';
import { useRouter } from 'expo-router';
import { LogOut, Key, ChevronRight, Fingerprint, Calendar, Bell } from 'lucide-react-native';
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
import { useAnnouncements } from '../../src/hooks/useAnnouncements';

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
  const { unreadCount: unreadAnnouncementCount } = useAnnouncements();

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
    <Box className="flex-1 bg-black overflow-hidden">
      {/* Background Ambient Glow */}
      <Box className="absolute top-[-50] right-[-50] w-[300] h-[300] opacity-30">
        <LinearGradient
          colors={['rgba(255, 59, 48, 0.15)', 'transparent']}
          style={{ flex: 1, borderRadius: 150 }}
        />
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
            <HStack space="sm" className="items-center">
              <TouchableOpacity
                onPress={() => router.push('/announcements')}
                activeOpacity={0.7}
                accessibilityLabel={t('announcements.title', 'Announcements')}
              >
                <Box className="w-10 h-10 rounded-full bg-white/5 border border-white/10 items-center justify-center relative">
                  <Bell size={18} color="#FFFFFF" />
                  {unreadAnnouncementCount > 0 ? (
                    <Box className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-[#EF4444] border border-black" />
                  ) : null}
                </Box>
              </TouchableOpacity>
              <GlassLanguageToggle />
            </HStack>
          </Box>

          {/* Header Section */}
          <VStack space="md" className="items-center mb-8 px-6">
            <View style={{ width: 140, height: 140, marginBottom: 12, position: 'relative' }}>
              <Box
                className="w-full h-full rounded-full p-1.5 border border-[#FF3B30]/30 bg-[#1A1A1A]"
                style={{
                  shadowColor: '#FF3B30',
                  shadowOffset: { width: 0, height: 0 },
                  shadowOpacity: 0.3,
                  shadowRadius: 25,
                }}
              >
                <Box className="w-full h-full rounded-full overflow-hidden border-[3px] border-[#FF3B30]">
                  <Image
                    source={{ uri: DEFAULT_AVATAR }}
                    style={{ width: '100%', height: '100%' }}
                    resizeMode="cover"
                  />
                  <LinearGradient
                    colors={['rgba(255,255,255,0.05)', 'transparent']}
                    style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
                  />
                </Box>
              </Box>
              <Box className="absolute bottom-3 right-3 w-7 h-7 bg-[#0A0A0A] rounded-full items-center justify-center border border-white/10">
                <Box
                  className="w-3.5 h-3.5 bg-[#34C759] rounded-full"
                  style={{
                    shadowColor: '#34C759',
                    shadowOffset: { width: 0, height: 0 },
                    shadowOpacity: 0.6,
                    shadowRadius: 10,
                  }}
                />
              </Box>
            </View>

            <VStack className="items-center" space="xs">
              <Heading size="3xl" className="text-white font-bold tracking-tight">
                {employee?.fullName}
              </Heading>
              <Text className="text-[#A0A0A0] font-medium tracking-wider" size="sm">
                ID: {employee?.employeeNumber}
              </Text>

              <Box className="mt-4 px-5 py-2 rounded-full bg-[#1A1110] border border-[#FF3B30]/10">
                <Text size="2xs" className="font-bold uppercase tracking-[1.5px] text-[#FF3B30]/80">
                  {employee?.department || 'Security Unit'} • {employee?.jobTitle || 'Officer'}
                </Text>
              </Box>
            </VStack>
          </VStack>

          {/* Account Settings */}
          <VStack space="md" className="px-5 mb-8">
            <Text size="2xs" className="font-bold text-[#666666] uppercase tracking-[2px] ml-4">
              {t('account.settings', 'Account Settings')}
            </Text>

            <Box className="bg-[#121212] border border-white/5 rounded-3xl p-2">
              <VStack space="xs">
                {/* Leave Requests */}
                <TouchableOpacity onPress={() => router.push('/leave-requests')} activeOpacity={0.7}>
                  <Box className="flex-row items-center justify-between p-4 rounded-2xl bg-[#1A1A1A] border border-white/5">
                    <HStack space="md" className="items-center">
                      <Box className="w-10 h-10 rounded-xl bg-[#34C759]/10 items-center justify-center border border-[#34C759]/20">
                        <Calendar size={20} color="#34C759" />
                      </Box>
                      <Text size="sm" className="font-semibold text-white">
                        {t('leave.title', 'Leave Requests')}
                      </Text>
                    </HStack>
                    <ChevronRight size={18} color="#666666" />
                  </Box>
                </TouchableOpacity>

                {/* Change Password */}
                <TouchableOpacity onPress={() => openPasswordChangeModal(false)} activeOpacity={0.7}>
                  <Box className="flex-row items-center justify-between p-4 rounded-2xl bg-[#1A1A1A] border border-white/5">
                    <HStack space="md" className="items-center">
                      <Box className="w-10 h-10 rounded-xl bg-[#007AFF]/10 items-center justify-center border border-[#007AFF]/20">
                        <Key size={20} color="#007AFF" />
                      </Box>
                      <Text size="sm" className="font-semibold text-white">
                        {t('dashboard.changePassword')}
                      </Text>
                    </HStack>
                    <ChevronRight size={18} color="#666666" />
                  </Box>
                </TouchableOpacity>

                {/* Announcements */}
                <TouchableOpacity onPress={() => router.push('/announcements')} activeOpacity={0.7}>
                  <Box className="flex-row items-center justify-between p-4 rounded-2xl bg-[#1A1A1A] border border-white/5">
                    <HStack space="md" className="items-center">
                      <Box className="w-10 h-10 rounded-xl bg-[#F97316]/10 items-center justify-center border border-[#F97316]/20">
                        <Bell size={20} color="#F97316" />
                      </Box>
                      <VStack>
                        <Text size="sm" className="font-semibold text-white">
                          {t('announcements.title', 'Announcements')}
                        </Text>
                        {unreadAnnouncementCount > 0 ? (
                          <Text className="text-[#F97316] font-bold uppercase tracking-[1.2px]" size="2xs">
                            {t('announcements.newCount', '{{count}} new', { count: unreadAnnouncementCount })}
                          </Text>
                        ) : null}
                      </VStack>
                    </HStack>
                    <ChevronRight size={18} color="#666666" />
                  </Box>
                </TouchableOpacity>

                {/* Biometrics */}
                {isBiometricAvailable && (
                  <Box className="flex-row items-center justify-between p-4 rounded-2xl bg-[#1A1A1A] border border-white/5">
                    <HStack space="md" className="items-center">
                      <Box className="w-10 h-10 rounded-xl bg-[#AF52DE]/10 items-center justify-center border border-[#AF52DE]/20">
                        <Fingerprint size={20} color="#AF52DE" />
                      </Box>
                      <VStack>
                        <Text size="sm" className="font-semibold text-white">
                          {t('biometric.settingsTitle')}
                        </Text>
                        <Text className="text-[#666666] font-bold uppercase tracking-[1.5px]" size="2xs">
                          {biometricType}
                        </Text>
                      </VStack>
                    </HStack>
                    <Switch
                      value={isBiometricEnabled}
                      onValueChange={handleToggleBiometric}
                      trackColor={{ false: '#2C2C2E', true: '#FF3B30' }}
                      thumbColor="#FFFFFF"
                    />
                  </Box>
                )}
              </VStack>
            </Box>
          </VStack>

          {/* Logout Section */}
          <Box className="px-5">
            <Box className="bg-[#121212] border border-white/5 rounded-3xl p-2">
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
                <Box className="flex-row items-center p-4 rounded-2xl bg-[#1A1A1A] border border-white/5">
                  <HStack space="md" className="items-center">
                    <Box className="w-10 h-10 rounded-xl bg-[#FF3B30]/10 items-center justify-center border border-[#FF3B30]/20">
                      <LogOut size={20} color="#FF3B30" />
                    </Box>
                    <Text size="sm" className="font-bold text-[#FF3B30] tracking-[1px] uppercase">
                      {t('dashboard.logout')}
                    </Text>
                  </HStack>
                </Box>
              </TouchableOpacity>
            </Box>
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
