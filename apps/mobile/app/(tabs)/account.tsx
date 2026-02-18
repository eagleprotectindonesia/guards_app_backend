import React, { useEffect, useState } from 'react';
import { ScrollView, Switch, Image, View, TouchableOpacity } from 'react-native';
import { Box, VStack, Heading, Text, HStack } from '@gluestack-ui/themed';
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
    <Box flex={1} bg="#121212" overflow="hidden">
      {/* Background Ambient Glow */}
      <Box position="absolute" top={0} right={0} w={256} h={256} opacity={0.2}>
        <LinearGradient colors={['rgba(37, 99, 235, 0.3)', 'transparent']} style={{ flex: 1, borderRadius: 128 }} />
      </Box>
      <Box position="absolute" bottom={0} left={0} w={256} h={256} opacity={0.2}>
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
          <Box px="$6" flexDirection="row" justifyContent="flex-end">
            <GlassLanguageToggle />
          </Box>

          {/* Header Section */}
          <VStack space="lg" alignItems="center" mb="$8" px="$6">
            <View style={{ width: 128, height: 128, marginBottom: 8, position: 'relative' }}>
              <Box
                w="100%"
                h="100%"
                rounded="$full"
                p="$1"
                borderWidth={1}
                borderColor="rgba(239, 68, 68, 0.3)"
                bg="$backgroundDark800"
                style={{
                  shadowColor: '#ef4444',
                  shadowOffset: { width: 0, height: 0 },
                  shadowOpacity: 0.4,
                  shadowRadius: 20,
                }}
              >
                <Box w="100%" h="100%" rounded="$full" overflow="hidden" borderWidth={2} borderColor="$red600">
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
              <Box
                position="absolute"
                bottom={8}
                right={8}
                w="$6"
                h="$6"
                bg="#181818"
                rounded="$full"
                alignItems="center"
                justifyContent="center"
                borderWidth={1}
                borderColor="$backgroundDark700"
              >
                <Box
                  w="$3"
                  h="$3"
                  bg="$emerald500"
                  rounded="$full"
                  style={{
                    shadowColor: '#10b981',
                    shadowOffset: { width: 0, height: 0 },
                    shadowOpacity: 0.8,
                    shadowRadius: 8,
                  }}
                />
              </Box>
            </View>

            <VStack alignItems="center">
              <HStack space="xs">
                <Heading size="2xl" color="$white" fontWeight="$bold">
                  {employee?.firstName}
                </Heading>
                <Heading size="2xl" color="$red500" fontWeight="$bold">
                  {employee?.lastName}
                </Heading>
              </HStack>
              <Text color="$textDark500" size="sm" fontWeight="$semibold" letterSpacing={0.5}>
                ID: {employee?.employeeCode}
              </Text>

              <Box
                mt="$4"
                px="$4"
                py="$1.5"
                rounded="$full"
                bg="rgba(255,255,255,0.05)"
                borderWidth={1}
                borderColor="rgba(255,255,255,0.05)"
              >
                <Text size="2xs" fontWeight="$bold" textTransform="uppercase" letterSpacing={1.2} color="$textDark400">
                  {employee?.department?.name || 'Security Unit'} • {employee?.designation?.name || 'Alpha Team'}
                </Text>
              </Box>
            </VStack>
          </VStack>

          {/* Account Settings */}
          <VStack space="md" px="$6" mb="$8">
            <Text
              size="2xs"
              fontWeight="$bold"
              color="$textDark500"
              textTransform="uppercase"
              letterSpacing={1.2}
              ml="$2"
            >
              {t('account.settings', 'Account Settings')}
            </Text>

            <Box bg="rgba(30, 30, 30, 0.4)" borderWidth={1} borderColor="rgba(255, 255, 255, 0.08)" rounded={32} p="$2">
              <VStack space="sm">
                {/* Change Password */}
                <TouchableOpacity onPress={() => openPasswordChangeModal(false)} activeOpacity={0.7}>
                  <Box
                    flexDirection="row"
                    alignItems="center"
                    justifyContent="space-between"
                    p="$4"
                    rounded={16}
                    bg="rgba(255, 255, 255, 0.03)"
                    borderWidth={1}
                    borderColor="rgba(255, 255, 255, 0.05)"
                  >
                    <HStack space="md" alignItems="center">
                      <Box
                        w="$10"
                        h="$10"
                        rounded="$xl"
                        bg="rgba(59, 130, 246, 0.1)"
                        alignItems="center"
                        justifyContent="center"
                        borderWidth={1}
                        borderColor="rgba(59, 130, 246, 0.2)"
                      >
                        <Key size={20} color="#3b82f6" />
                      </Box>
                      <Text size="sm" fontWeight="$semibold" color="$textDark200">
                        {t('dashboard.changePassword')}
                      </Text>
                    </HStack>
                    <ChevronRight size={16} color="#4b5563" />
                  </Box>
                </TouchableOpacity>

                {/* Biometrics */}
                {isBiometricAvailable && (
                  <Box
                    flexDirection="row"
                    alignItems="center"
                    justifyContent="space-between"
                    p="$4"
                    rounded={16}
                    bg="rgba(255, 255, 255, 0.03)"
                    borderWidth={1}
                    borderColor="rgba(255, 255, 255, 0.05)"
                  >
                    <HStack space="md" alignItems="center">
                      <Box
                        w="$10"
                        h="$10"
                        rounded="$xl"
                        bg="rgba(168, 85, 247, 0.1)"
                        alignItems="center"
                        justifyContent="center"
                        borderWidth={1}
                        borderColor="rgba(168, 85, 247, 0.2)"
                      >
                        <Fingerprint size={20} color="#a855f7" />
                      </Box>
                      <VStack>
                        <Text size="sm" fontWeight="$semibold" color="$textDark200">
                          {t('biometric.settingsTitle')}
                        </Text>
                        <Text
                          color="$textDark500"
                          size="2xs"
                          fontWeight="$bold"
                          textTransform="uppercase"
                          letterSpacing={1}
                        >
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
          <Box px="$6">
            <Box bg="rgba(30, 30, 30, 0.4)" borderWidth={1} borderColor="rgba(255, 255, 255, 0.08)" rounded={32} p="$2">
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
                <Box
                  flexDirection="row"
                  alignItems="center"
                  p="$4"
                  rounded={16}
                  bg="rgba(255, 255, 255, 0.03)"
                  borderWidth={1}
                  borderColor="rgba(255, 255, 255, 0.05)"
                >
                  <HStack space="md" alignItems="center">
                    <Box
                      w="$10"
                      h="$10"
                      rounded="$xl"
                      bg="rgba(239, 68, 68, 0.1)"
                      alignItems="center"
                      justifyContent="center"
                      borderWidth={1}
                      borderColor="rgba(239, 68, 68, 0.2)"
                    >
                      <LogOut size={20} color="#ef4444" />
                    </Box>
                    <Text size="sm" fontWeight="$bold" color="$red500" letterSpacing={0.5}>
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
