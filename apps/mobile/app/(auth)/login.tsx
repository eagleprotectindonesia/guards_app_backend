import React, { useState, useEffect } from 'react';
import { Alert, View } from 'react-native';
import {
  VStack,
  FormControl,
  FormControlLabel,
  FormControlLabelText,
  Input,
  InputField,
  InputSlot,
  InputIcon,
  Button,
  ButtonText,
  Heading,
  Text,
  ButtonSpinner,
  FormControlError,
  FormControlErrorText,
  FormControlErrorIcon,
  Box,
  Spinner,
  Center,
} from '@gluestack-ui/themed';
import { useMutation } from '@tanstack/react-query';
import { client } from '../../src/api/client';
import { storage, STORAGE_KEYS } from '../../src/utils/storage';
import { CircleAlert, Eye, EyeOff } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { useRouter } from 'expo-router';

export default function LoginScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const [employeeId, setEmployeeId] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const token = await storage.getItem(STORAGE_KEYS.TOKEN);
        if (token) {
          // Verify session with backend
          await client.get('/api/employee/auth/check');
          router.replace('/(tabs)');
          return;
        }
      } catch (error) {
        // Token invalid or session expired, stay on login
        console.log('Auto-login check failed:', error);
      } finally {
        setIsCheckingAuth(false);
      }
    };

    checkAuth();
  }, [router]);

  const loginMutation = useMutation({
    mutationFn: async () => {
      const response = await client.post('/api/employee/auth/login', {
        employeeId,
        password,
      });
      return response.data;
    },
    onSuccess: async (data) => {
      if (data.token) {
        await storage.setItem(STORAGE_KEYS.TOKEN, data.token);
      }
      if (data.employee) {
        await storage.setItem(STORAGE_KEYS.EMPLOYEE_INFO, data.employee);
      }
      router.replace('/(tabs)');
    },
    onError: (error: any) => {
      const message = error.response?.data?.message || t('login.errorMessage');
      Alert.alert(t('login.errorTitle'), message);
    },
  });

  const handleLogin = () => {
    if (!employeeId || !password) {
      Alert.alert(t('login.validationErrorTitle'), t('login.validationErrorMessage'));
      return;
    }
    loginMutation.mutate();
  };

  if (isCheckingAuth) {
    return (
      <Center className="flex-1 bg-white">
        <Spinner size="large" color="#2563EB" />
      </Center>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: 'white', justifyContent: 'center', paddingHorizontal: 24 }}>
      <VStack space="xl">
        <Box className="mb-4">
          <Heading size="2xl" style={{ color: '#111827' }}>
            {t('login.title')}
          </Heading>
          <Text style={{ color: '#6B7280' }}>{t('login.subtitle')}</Text>
        </Box>

        <FormControl isInvalid={loginMutation.isError}>
          <FormControlLabel className="mb-1">
            <FormControlLabelText>{t('login.employeeIdLabel')}</FormControlLabelText>
          </FormControlLabel>
          <Box className="mb-4 bg-gray-50 border border-gray-200 rounded-md">
            <Input size="xl" variant="outline">
              <InputField
                placeholder={t('login.employeeIdPlaceholder')}
                value={employeeId}
                onChangeText={(text: string) => setEmployeeId(text.toUpperCase())}
                autoCapitalize="characters"
                maxLength={6}
              />
            </Input>
          </Box>

          <FormControlLabel className="mb-1">
            <FormControlLabelText>{t('login.passwordLabel')}</FormControlLabelText>
          </FormControlLabel>
          <Box className="mb-6 bg-gray-50 border border-gray-200 rounded-md">
            <Input size="xl" variant="outline">
              <InputField
                type={showPassword ? 'text' : 'password'}
                placeholder={t('login.passwordPlaceholder')}
                value={password}
                onChangeText={setPassword}
              />
              <InputSlot pr="$4" onPress={() => setShowPassword(!showPassword)}>
                <InputIcon as={showPassword ? Eye : EyeOff} color="$gray500" />
              </InputSlot>
            </Input>
          </Box>

          <Button
            size="xl"
            onPress={handleLogin}
            isDisabled={loginMutation.isPending}
            style={{ backgroundColor: '#2563EB' }}
          >
            {loginMutation.isPending ? <ButtonSpinner mr="$2" color="white" /> : null}
            <ButtonText>{t('login.submitButton')}</ButtonText>
          </Button>

          {loginMutation.isError && (
            <FormControlError className="mt-4">
              <FormControlErrorIcon as={CircleAlert} />
              <FormControlErrorText>
                {loginMutation.error instanceof Error ? loginMutation.error.message : 'Authentication failed'}
              </FormControlErrorText>
            </FormControlError>
          )}
        </FormControl>
      </VStack>
    </View>
  );
}
