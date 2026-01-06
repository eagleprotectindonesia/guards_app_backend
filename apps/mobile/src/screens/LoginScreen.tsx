import React, { useState } from 'react';
import { Alert } from 'react-native';
import {
  Box,
  VStack,
  FormControl,
  FormControlLabel,
  FormControlLabelText,
  Input,
  InputField,
  Button,
  ButtonText,
  Heading,
  Text,
  ButtonSpinner,
  FormControlError,
  FormControlErrorText,
  FormControlErrorIcon,
} from '@gluestack-ui/themed';
import { useMutation } from '@tanstack/react-query';
import { client } from '../api/client';
import { CircleAlert } from 'lucide-react-native';

export default function LoginScreen({ navigation }: any) {
  const [employeeId, setEmployeeId] = useState('');
  const [password, setPassword] = useState('');

  const loginMutation = useMutation({
    mutationFn: async () => {
      const response = await client.post('/api/auth/guard/login', {
        employeeId,
        password,
      });
      return response.data;
    },
    onSuccess: () => {
      navigation.replace('Main');
    },
    onError: (error: any) => {
      const message = error.response?.data?.message || 'Login gagal. Silakan periksa kredensial Anda.';
      Alert.alert('Kesalahan Login', message);
    },
  });

  const handleLogin = () => {
    if (!employeeId || !password) {
      Alert.alert('Error', 'Silakan masukkan ID Karyawan dan Kata Sandi.');
      return;
    }
    loginMutation.mutate();
  };

  return (
    <Box className="flex-1 bg-white justify-center px-6">
      <VStack space="xl">
        <Box className="mb-4">
          <Heading size="2xl" style={{ color: '#111827' }}>
            Portal Guard
          </Heading>
          <Text style={{ color: '#6B7280' }}>
            Masuk untuk mengelola shift dan kehadiran Anda.
          </Text>
        </Box>

        <FormControl isInvalid={loginMutation.isError}>
          <FormControlLabel className="mb-1">
            <FormControlLabelText>ID Karyawan</FormControlLabelText>
          </FormControlLabel>
          <Box className="mb-4 bg-gray-50 border border-gray-200 rounded-md">
            <Input size="xl" variant="outline">
              <InputField
                placeholder="Masukkan ID Guard Anda"
                value={employeeId}
                onChangeText={(text:string) => setEmployeeId(text.toUpperCase())}
                autoCapitalize="characters"
              />
            </Input>
          </Box>

          <FormControlLabel className="mb-1">
            <FormControlLabelText>Kata Sandi</FormControlLabelText>
          </FormControlLabel>
          <Box className="mb-6 bg-gray-50 border border-gray-200 rounded-md">
            <Input size="xl" variant="outline">
              <InputField
                type="password"
                placeholder="Masukkan kata sandi Anda"
                value={password}
                onChangeText={setPassword}
                secureTextEntry
              />
            </Input>
          </Box>

          <Button
            size="xl"
            onPress={handleLogin}
            isDisabled={loginMutation.isPending}
            style={{ backgroundColor: '#2563EB' }}
          >
            {loginMutation.isPending ? <ButtonSpinner mr="$2" color="white" /> : null}
            <ButtonText>Masuk</ButtonText>
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
    </Box>
  );
}
