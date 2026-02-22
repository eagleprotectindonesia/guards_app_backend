import React, { useState, useEffect, useCallback } from 'react';
import { StatusBar } from 'expo-status-bar';
import { View, StyleSheet, Dimensions, Pressable, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { useAlert } from '../../src/contexts/AlertContext';
import { useCustomToast } from '../../src/hooks/useCustomToast';
import {
  VStack,
  Box,
  Heading,
  Text,
  ButtonSpinner,
  Input,
  InputField,
  InputSlot,
  InputIcon,
  FormControl,
  FormControlError,
  FormControlErrorText,
  FormControlErrorIcon,
} from '@gluestack-ui/themed';
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
    <Box flex={1} bg="#050505">
      <StatusBar style="light" />
      {/* Background Effects */}
      <View style={StyleSheet.absoluteFill}>
        {/* Radial Glow 1 */}
        <View
          style={{
            position: 'absolute',
            top: height * 0.1,
            left: width * 0.2,
            width: width * 0.6,
            height: width * 0.6,
            backgroundColor: '#E6392D',
            borderRadius: width * 0.3,
            opacity: 0.08,
            transform: [{ scale: 2 }],
          }}
        />
        {/* Radial Glow 2 */}
        <View
          style={{
            position: 'absolute',
            bottom: height * 0.1,
            right: width * 0.1,
            width: width * 0.4,
            height: width * 0.4,
            backgroundColor: '#E6392D',
            borderRadius: width * 0.2,
            opacity: 0.05,
            transform: [{ scale: 1.5 }],
          }}
        />
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 24 }}
          showsVerticalScrollIndicator={false}
        >
          {/* Language Toggle */}
          <View style={styles.languageToggleContainer}>
            <GlassLanguageToggle />
          </View>

          {/* Logo & Header */}
          <VStack space="md" alignItems="center" mb="$10">
            <Box position="relative">
              <Box
                position="absolute"
                top={0}
                left={0}
                right={0}
                bottom={0}
                bg="#E6392D"
                opacity={0.15}
                rounded="$full"
                style={{ filter: 'blur(35px)' }}
              />
              <Box w={120} h={120} alignItems="center" justifyContent="center">
                <LogoIcon width={120} height={120} />
              </Box>
            </Box>
            <VStack alignItems="center">
              <Heading size="3xl" color="white" style={styles.heading}>
                Eagle
                <Text color="#E6392D" size="3xl" style={styles.headingStrong}>
                  Protect
                </Text>
              </Heading>
              <Text size="sm" color="#6B7280" fontWeight="$bold" style={styles.subtitle}>
                EMPLOYEE PORTAL
              </Text>
            </VStack>
          </VStack>

          {/* Login Card */}
          <BlurView intensity={30} tint="dark" style={styles.glassCard}>
            <LinearGradient
              colors={['rgba(255, 255, 255, 0.05)', 'transparent']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.cardGradient}
            >
              <VStack space="lg">
                <FormControl isInvalid={loginMutation.isError}>
                  <VStack space="sm">
                    <Text size="sm" fontWeight="$bold" color="#6B7280" style={styles.inputLabel}>
                      {t('login.employeeIdLabel')}
                    </Text>
                    <Box style={styles.inputContainer}>
                      <Input size="md">
                        <InputSlot pl="$4">
                          <InputIcon as={User} color="#6B7280" />
                        </InputSlot>
                        <InputField
                          placeholder={t('login.employeeIdPlaceholder')}
                          placeholderTextColor="#3F3F46"
                          color="white"
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

                  <VStack space="sm" mt="$4">
                    <Text size="sm" fontWeight="$bold" color="#6B7280" style={styles.inputLabel}>
                      {t('login.passwordLabel')}
                    </Text>
                    <Box style={styles.inputContainer}>
                      <Input size="md">
                        <InputSlot pl="$4">
                          <InputIcon as={Lock} color="#6B7280" />
                        </InputSlot>
                        <InputField
                          type={showPassword ? 'text' : 'password'}
                          placeholder={t('login.passwordPlaceholder')}
                          placeholderTextColor="#3F3F46"
                          color="white"
                          value={password}
                          onChangeText={text => {
                            setPassword(text);
                            if (loginMutation.isError) loginMutation.reset();
                          }}
                        />
                        <InputSlot pr="$4" onPress={() => setShowPassword(!showPassword)}>
                          <InputIcon as={showPassword ? Eye : EyeOff} color="#6B7280" />
                        </InputSlot>
                      </Input>
                    </Box>
                  </VStack>

                  <Box mt="$12">
                    <Pressable onPress={handleLogin} disabled={loginMutation.isPending || isBioPending}>
                      {({ pressed }) => (
                        <LinearGradient
                          colors={['#FF1F1F', '#8B0000']}
                          start={{ x: 0, y: 0 }}
                          end={{ x: 1, y: 1 }}
                          style={[
                            styles.loginButton,
                            (pressed || loginMutation.isPending || isBioPending) && {
                              transform: [{ scale: 0.98 }],
                              opacity: 0.8,
                            },
                          ]}
                        >
                          {loginMutation.isPending || isBioPending ? (
                            <ButtonSpinner color="white" />
                          ) : (
                            <Box flexDirection="row" alignItems="center">
                              <Text color="white" fontWeight="$bold" style={styles.buttonText}>
                                {t('login.submitButton')}
                              </Text>
                              <Box ml="$2">
                                <InputIcon as={LogIn} color="white" size="sm" />
                              </Box>
                            </Box>
                          )}
                        </LinearGradient>
                      )}
                    </Pressable>
                  </Box>

                  {isBiometricAvailable && isBiometricEnabled && (
                    <Box mt="$4">
                      <Pressable onPress={handleBiometricLogin} disabled={loginMutation.isPending || isBioPending}>
                        {({ pressed }) => (
                          <Box
                            style={[
                              styles.biometricButton,
                              (pressed || isBioPending) && { backgroundColor: 'rgba(255, 255, 255, 0.1)' },
                            ]}
                          >
                            <Fingerprint size={20} color="#E6392D" />
                            <Text color="white" fontWeight="$medium" ml="$2" style={styles.biometricText}>
                              {t('biometric.loginButton')}
                              {biometricType !== 'Biometric' && ` (${biometricType})`}
                            </Text>
                          </Box>
                        )}
                      </Pressable>
                    </Box>
                  )}

                  {loginMutation.isError && (
                    <FormControlError mt="$4">
                      <FormControlErrorIcon as={CircleAlert} />
                      <FormControlErrorText color="#E6392D">{t('login.errorMessage')}</FormControlErrorText>
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
    top: 50,
    right: 24,
    zIndex: 100,
  },
  heading: {
    letterSpacing: -1,
    textShadowColor: 'rgba(0, 0, 0, 0.5)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  headingStrong: {
    textShadowColor: 'rgba(230, 57, 45, 0.7)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 15,
  },
  subtitle: {
    letterSpacing: 2,
    marginTop: 4,
    opacity: 0.6,
  },
  glassCard: {
    borderRadius: 32,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(230, 57, 45, 0.3)',
    backgroundColor: 'rgba(5, 5, 5, 0.85)',
    elevation: 10,
    shadowColor: '#E6392D',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.1,
    shadowRadius: 20,
  },
  cardGradient: {
    padding: 32,
  },
  inputLabel: {
    letterSpacing: 2,
    fontSize: 12,
    marginLeft: 4,
  },
  inputContainer: {
    backgroundColor: '#0F0F11',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.03)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.5,
    shadowRadius: 4,
  },
  loginButton: {
    paddingVertical: 16,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#E6392D',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 10,
    elevation: 5,
  },
  buttonText: {
    letterSpacing: 1.5,
    fontSize: 14,
  },
  biometricButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(230, 57, 45, 0.3)',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
  },
  biometricText: {
    fontSize: 14,
    letterSpacing: 1,
  },
});
