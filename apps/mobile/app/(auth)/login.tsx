import React, { useState, useEffect, useCallback } from 'react';
import { StatusBar } from 'expo-status-bar';
import {
  View,
  StyleSheet,
  Dimensions,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Keyboard,
  LayoutAnimation,
  UIManager,
} from 'react-native';
import { useAlert } from '../../src/contexts/AlertContext';
import { useCustomToast } from '../../src/hooks/useCustomToast';
import { VStack } from '@/components/ui/vstack';
import { Box } from '@/components/ui/box';
import { Heading } from '@/components/ui/heading';
import { Text } from '@/components/ui/text';
import { ButtonSpinner } from '@/components/ui/button';
import { Input, InputField, InputSlot, InputIcon } from '@/components/ui/input';
import { Icon } from '@/components/ui/icon';
import {
  FormControl,
  FormControlError,
  FormControlErrorText,
  FormControlErrorIcon,
} from '@/components/ui/form-control';
import { useMutation } from '@tanstack/react-query';
import { client } from '../../src/api/client';
import { useAuth } from '../../src/contexts/AuthContext';
import { CircleAlert, Eye, EyeOff, Lock, LogIn, User } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import GlassLanguageToggle from '../../src/components/GlassLanguageToggle';
import LogoIcon from '../../assets/icons/icon.svg';
import {
  checkBiometricAvailability,
  authenticateWithBiometric,
  getBiometricTypeLabel,
} from '../../src/utils/biometric';
import { Fingerprint } from 'lucide-react-native';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const { width, height } = Dimensions.get('window');

export default function LoginScreen() {
  const { t } = useTranslation();
  const { showAlert } = useAlert();
  const toast = useCustomToast();
  const router = useRouter();
  const { login, biometricLogin, enableBiometric, isBiometricEnabled } = useAuth();
  const [employeeNumber, setEmployeeNumber] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isBiometricAvailable, setIsBiometricAvailable] = useState(false);
  const [biometricType, setBiometricType] = useState('Biometric');
  const [isBioPending, setIsBioPending] = useState(false);
  const [isKeyboardVisible, setKeyboardVisible] = useState(false);

  useEffect(() => {
    const showSubscription = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      () => {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        setKeyboardVisible(true);
      }
    );
    const hideSubscription = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        setKeyboardVisible(false);
      }
    );

    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, []);

  const loginMutation = useMutation({
    mutationFn: async () => {
      const response = await client.post('/api/employee/auth/login', {
        employeeNumber,
        password,
      });
      return response.data;
    },
    onSuccess: async data => {
      if (data.token && data.employee) {
        await login(data.token, data.employee);

        // After successful login, check if we should prompt to enable biometric
        if (isBiometricAvailable && !isBiometricEnabled && !data.employee.mustChangePassword) {
          showAlert(t('biometric.enableTitle'), t('biometric.enableMessage'), [
            { text: t('common.cancel'), style: 'cancel' },
            {
              text: t('biometric.enableTitle'),
              onPress: async () => {
                const auth = await authenticateWithBiometric(t('biometric.promptMessage'));
                if (auth.success) {
                  await enableBiometric(data.employee.id, password);
                  toast.success(t('common.successTitle', 'Success'), t('biometric.enableSuccess'));
                }
              },
            },
          ]);
        }

        router.replace('/(tabs)');
      } else {
        toast.error(t('login.errorTitle'), t('login.errorMessage'));
      }
    },
  });

  const handleBiometricLogin = useCallback(async () => {
    if (isBioPending) return;

    try {
      setIsBioPending(true);
      // biometricLogin now handles the prompt internally
      const success = await biometricLogin();
      if (success) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        router.replace('/(tabs)');
      } else {
        // If failed (and not cancelled implicitly handled by biometricLogin returning false)
        // We might want to show alert only if it wasn't a user cancellation?
        // biometricLogin implementation returns false on error/cancel.
        // It logs error.
        // We can show a generic failed message or just Haptics error.
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);

        // Note: biometricLogin prompts. If user cancels, it returns false.
        // If we alert here, we alert on cancel too?
        // Let's look at biometricLogin result. It only returns boolean.
        // Maybe we accept that for now.
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsBioPending(false);
    }
  }, [biometricLogin, isBioPending, router]);

  useEffect(() => {
    const initBiometric = async () => {
      const { available } = await checkBiometricAvailability();
      setIsBiometricAvailable(available);
      if (available) {
        const typeLabel = await getBiometricTypeLabel();
        setBiometricType(typeLabel);
      }
    };
    initBiometric();
  }, [setBiometricType]);

  const handleLogin = () => {
    if (!employeeNumber || !password) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      toast.error(t('login.validationErrorTitle'), t('login.validationErrorMessage'));
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    loginMutation.mutate();
  };

  return (
    <Box className="flex-1 bg-black">
      <StatusBar style="light" />
      {/* Background Effects */}
      <View style={StyleSheet.absoluteFill}>
        {/* Radial Glow 1 */}
        <View
          style={{
            position: 'absolute',
            top: height * 0.05,
            left: width * 0.1,
            width: width * 0.8,
            height: width * 0.8,
            backgroundColor: '#FF3B30',
            borderRadius: width * 0.4,
            opacity: 0.06,
            transform: [{ scale: 2 }],
          }}
        />
        {/* Radial Glow 2 */}
        <View
          style={{
            position: 'absolute',
            bottom: height * 0.05,
            right: width * 0.05,
            width: width * 0.5,
            height: width * 0.5,
            backgroundColor: '#FF3B30',
            borderRadius: width * 0.25,
            opacity: 0.04,
            transform: [{ scale: 1.5 }],
          }}
        />
      </View>

      {/* Language Toggle - Fixed at top */}
      <View style={styles.languageToggleContainer}>
        <GlassLanguageToggle />
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 24 }}
          showsVerticalScrollIndicator={false}
        >
          {/* Logo & Header */}
          {!isKeyboardVisible && (
            <VStack space="lg" className="items-center mb-12">
              <Box className="relative">
                <Box
                  className="absolute top-[-10] left-[-10] right-[-10] bottom-[-10] bg-[#FF3B30] opacity-20 rounded-full"
                  style={{ filter: 'blur(30px)' }}
                />
                <Box className="w-[120px] h-[120px] bg-white items-center justify-center rounded-2xl p-4 shadow-2xl">
                  <LogoIcon width={100} height={100} />
                </Box>
              </Box>
              <VStack className="items-center">
                <Heading size="4xl" className="text-white font-bold tracking-tight">
                  Eagle
                  <Text size="4xl" className="text-[#FF3B30] font-bold">
                    Protect
                  </Text>
                </Heading>
                <Text size="xs" className="text-[#A1A1A1] font-bold tracking-[4px] mt-1 uppercase">
                  EMPLOYEE PORTAL
                </Text>
              </VStack>
            </VStack>
          )}

          {/* Login Card */}
          <BlurView intensity={30} tint="dark" style={styles.glassCard}>
            <LinearGradient
              colors={['rgba(255, 255, 255, 0.05)', 'transparent']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.cardGradient}
            >
              <VStack space="xl">
                <FormControl isInvalid={loginMutation.isError}>
                  <VStack space="md">
                    <VStack space="xs">
                      <Text size="2xs" className="font-bold text-[#A1A1A1] uppercase tracking-[2px] ml-4">
                        {t('login.employeeIdLabel')}
                      </Text>
                      <Box style={styles.inputContainer} className="bg-[#1A1A1C] border border-white/5 rounded-2xl">
                        <Input size="md" className="border-0 h-14">
                          <InputSlot className="pl-5">
                            <InputIcon as={User} className="text-[#A1A1A1]" size="sm" />
                          </InputSlot>
                          <InputField
                            placeholder={t('login.employeeIdPlaceholder')}
                            placeholderTextColor="#636366"
                            className="text-white font-medium pl-3 h-14"
                            value={employeeNumber}
                            onChangeText={(text: string) => {
                              setEmployeeNumber(text.toUpperCase());
                              if (loginMutation.isError) loginMutation.reset();
                            }}
                            autoCapitalize="characters"
                            maxLength={6}
                          />
                        </Input>
                      </Box>
                    </VStack>

                    <VStack space="xs" className="mt-4">
                      <Text size="2xs" className="font-bold text-[#A1A1A1] uppercase tracking-[2px] ml-4">
                        {t('login.passwordLabel')}
                      </Text>
                      <Box style={styles.inputContainer} className="bg-[#1A1A1C] border border-white/5 rounded-2xl">
                        <Input size="md" className="border-0 h-14">
                          <InputSlot className="pl-5">
                            <InputIcon as={Lock} className="text-[#A1A1A1]" size="sm" />
                          </InputSlot>
                          <InputField
                            type={showPassword ? 'text' : 'password'}
                            placeholder={t('login.passwordPlaceholder')}
                            placeholderTextColor="#636366"
                            className="text-white font-medium pl-3 h-14"
                            value={password}
                            onChangeText={text => {
                              setPassword(text);
                              if (loginMutation.isError) loginMutation.reset();
                            }}
                          />
                          <InputSlot className="pr-5" onPress={() => setShowPassword(!showPassword)}>
                            <InputIcon as={showPassword ? Eye : EyeOff} className="text-[#A1A1A1]" size="sm" />
                          </InputSlot>
                        </Input>
                      </Box>
                    </VStack>
                  </VStack>
                  <Box className="mt-10">
                    <Pressable onPress={handleLogin} disabled={loginMutation.isPending || isBioPending}>
                      {({ pressed }) => (
                        <LinearGradient
                          colors={['#FF3B30', '#A00000']}
                          start={{ x: 0, y: 0 }}
                          end={{ x: 1, y: 1 }}
                          style={[
                            styles.loginButton,
                            (pressed || loginMutation.isPending || isBioPending) && {
                              transform: [{ scale: 0.98 }],
                              opacity: 0.9,
                            },
                          ]}
                        >
                          {loginMutation.isPending || isBioPending ? (
                            <ButtonSpinner className="text-white" />
                          ) : (
                            <Box className="flex-row items-center">
                              <Text className="text-white font-bold tracking-[2px] uppercase text-[15px]">
                                {t('login.submitButton')}
                              </Text>
                              <Box className="ml-2">
                                <Icon as={LogIn} className="text-white" size="xs" />
                              </Box>
                            </Box>
                          )}
                        </LinearGradient>
                      )}
                    </Pressable>
                  </Box>

                  {isBiometricAvailable && isBiometricEnabled && (
                    <Box className="mt-4">
                      <Pressable onPress={handleBiometricLogin} disabled={loginMutation.isPending || isBioPending}>
                        {({ pressed }) => (
                          <Box
                            style={[
                              styles.biometricButton,
                              (pressed || isBioPending) && { backgroundColor: 'rgba(255, 255, 255, 0.1)' },
                            ]}
                          >
                            <Fingerprint size={20} color="#FF3B30" />
                            <Text className="text-white font-medium ml-2 text-[14px] tracking-[1px]">
                              {t('biometric.loginButton')}
                              {biometricType !== 'Biometric' && ` (${biometricType})`}
                            </Text>
                          </Box>
                        )}
                      </Pressable>
                    </Box>
                  )}

                  {loginMutation.isError && (
                    <FormControlError className="mt-4">
                      <FormControlErrorIcon as={CircleAlert} className="text-[#FF3B30]" />
                      <FormControlErrorText className="text-[#FF3B30]">{t('login.errorMessage')}</FormControlErrorText>
                    </FormControlError>
                  )}
                </FormControl>
              </VStack>
            </LinearGradient>
          </BlurView>
        </ScrollView>
      </KeyboardAvoidingView>
    </Box>
  );
}

const styles = StyleSheet.create({
  languageToggleContainer: {
    position: 'absolute',
    top: 60,
    right: 24,
    zIndex: 100,
  },
  glassCard: {
    borderRadius: 40,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255, 59, 48, 0.25)',
    backgroundColor: 'rgba(5, 5, 5, 0.8)',
    elevation: 15,
    shadowColor: '#FF3B30',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.15,
    shadowRadius: 24,
  },
  cardGradient: {
    padding: 24,
    paddingVertical: 32,
  },
  inputContainer: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 4,
  },
  loginButton: {
    height: 64,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#FF3B30',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 15,
    elevation: 10,
  },
  biometricButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 56,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255, 59, 48, 0.25)',
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
  },
});
