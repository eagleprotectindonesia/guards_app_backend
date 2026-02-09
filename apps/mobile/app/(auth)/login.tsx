import React, { useState } from 'react';
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
  Center,
  Spinner,
} from '@gluestack-ui/themed';
import { useMutation } from '@tanstack/react-query';
import { client } from '../../src/api/client';
import { useAuth } from '../../src/contexts/AuthContext';
import { CircleAlert, Eye, EyeOff, User, Lock } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';

export default function LoginScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { login, isLoading: isAuthLoading } = useAuth();
  const [employeeId, setEmployeeId] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const loginMutation = useMutation({
    mutationFn: async () => {
      const response = await client.post('/api/employee/auth/login', {
        employeeId,
        password,
      });
      return response.data;
    },
    onSuccess: async (data) => {
      if (data.token && data.employee) {
        await login(data.token, data.employee);
        router.replace('/(tabs)');
      } else {
        Alert.alert(t('login.errorTitle'), t('login.errorMessage'));
      }
    },
    onError: (error: any) => {
      const message = error.response?.data?.message || t('login.errorMessage');
      Alert.alert(t('login.errorTitle'), message);
    },
  });

  const handleLogin = () => {
    if (!employeeId || !password) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert(t('login.validationErrorTitle'), t('login.validationErrorMessage'));
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    loginMutation.mutate();
  };

  if (isAuthLoading) {
    return (
      <Center flex={1} bg="$white">
        <Spinner size="large" color="#2563EB" />
      </Center>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: 'white', justifyContent: 'center', paddingHorizontal: 24 }}>
      <VStack space="xl">
        <Box mb="$4">
          <Heading size="2xl" style={{ color: '#111827' }}>
            {t('login.title')}
          </Heading>
          <Text style={{ color: '#6B7280' }}>{t('login.subtitle')}</Text>
        </Box>

        <FormControl isInvalid={loginMutation.isError}>
          <FormControlLabel mb="$1">
            <FormControlLabelText>{t('login.employeeIdLabel')}</FormControlLabelText>
          </FormControlLabel>
          <Box mb="$4" bg="$white" borderWidth={1} borderColor="$borderLight300" rounded="$xl" softShadow="1">
            <Input size="xl" variant="outline">
              <InputSlot pl="$4">
                <InputIcon as={User} color="$gray400" />
              </InputSlot>
              <InputField
                placeholder={t('login.employeeIdPlaceholder')}
                value={employeeId}
                onChangeText={(text: string) => setEmployeeId(text.toUpperCase())}
                autoCapitalize="characters"
                maxLength={6}
              />
            </Input>
          </Box>

          <FormControlLabel mb="$1">
            <FormControlLabelText>{t('login.passwordLabel')}</FormControlLabelText>
          </FormControlLabel>
          <Box mb="$6" bg="$white" borderWidth={1} borderColor="$borderLight300" rounded="$xl" softShadow="1">
            <Input size="xl" variant="outline">
              <InputSlot pl="$4">
                <InputIcon as={Lock} color="$gray400" />
              </InputSlot>
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
            style={{ backgroundColor: '#2563EB', shadowColor: '#2563EB', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8 }}
          >
            {loginMutation.isPending ? <ButtonSpinner mr="$2" color="white" /> : null}
            <ButtonText>{t('login.submitButton')}</ButtonText>
          </Button>

          {loginMutation.isError && (
            <FormControlError mt="$4">
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
