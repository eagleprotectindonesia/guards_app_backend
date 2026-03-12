import React, { useState } from 'react';
import { useCustomToast } from '../hooks/useCustomToast';
import {
  Modal,
  ModalBackdrop,
  ModalContent,
  ModalHeader,
  ModalCloseButton,
  ModalBody,
} from '@/components/ui/modal';
import { Heading } from '@/components/ui/heading';
import { Icon, CloseIcon } from '@/components/ui/icon';
import { Button, ButtonText, ButtonSpinner } from '@/components/ui/button';
import { VStack } from '@/components/ui/vstack';
import { FormControl, FormControlLabel, FormControlLabelText } from '@/components/ui/form-control';
import { Input, InputField, InputSlot, InputIcon } from '@/components/ui/input';
import { Text } from '@/components/ui/text';
import { Box } from '@/components/ui/box';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { client } from '../api/client';
import { Eye, EyeOff, Lock, RefreshCcw } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { queryKeys } from '../api/queryKeys';
import { Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

type PasswordChangeModalProps = {
  isOpen: boolean;
  onClose: () => void;
  isForce?: boolean;
};

export default function PasswordChangeModal({ isOpen, onClose, isForce }: PasswordChangeModalProps) {
  const { t } = useTranslation();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [validationErrors, setValidationErrors] = useState<{ field: string; message: string }[]>([]);
  const toast = useCustomToast();
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async () => {
      const response = await client.post('/api/employee/my/profile/change-password', {
        currentPassword,
        newPassword,
      });
      return response.data;
    },
    onSuccess: () => {
      toast.success(t('passwordChange.successTitle'), t('passwordChange.successMessage'));
      resetForm();
      queryClient.invalidateQueries({ queryKey: queryKeys.profile });
      onClose();
    },
    onError: (error: any) => {
      const data = error.response?.data;
      if (data?.errors) {
        setValidationErrors(
          data.errors.map((e: any) => ({
            field: e.path?.[0] || 'unknown',
            message: e.message,
          }))
        );
      } else {
        toast.error('Error', data?.message || t('passwordChange.failMessage'));
      }
    },
  });

  const resetForm = () => {
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setValidationErrors([]);
  };

  const handleUpdate = () => {
    setValidationErrors([]);

    // Client-side validations
    const errors = [];

    if (!currentPassword) {
      errors.push({ field: 'currentPassword', message: t('passwordChange.currentPasswordRequired') });
    }

    if (newPassword.length < 8) {
      errors.push({ field: 'newPassword', message: t('passwordChange.newPasswordMinLength') });
    }

    if (newPassword !== confirmPassword) {
      errors.push({ field: 'confirmPassword', message: t('passwordChange.passwordsDoNotMatch') });
    }

    if (errors.length > 0) {
      setValidationErrors(errors);
      return;
    }

    mutation.mutate();
  };

  const getError = (field: string) => validationErrors.find(e => e.field === field);
  const newPasswordError = getError('newPassword');
  const currentPasswordError = getError('currentPassword');
  const confirmPasswordError = getError('confirmPassword');

  // Custom colors based on design
  const PRIMARY_COLOR = '#ec5b13';
  const PRIMARY_DARK = '#8b3105';

  return (
    <Modal isOpen={isOpen} onClose={isForce ? () => {} : onClose} closeOnOverlayClick={!isForce}>
      <ModalBackdrop className="bg-background-950 opacity-80" />
      <ModalContent
        className="bg-transparent p-0 w-full m-4 rounded-2xl"
        style={{
          maxWidth: Platform.OS === 'web' ? 440 : undefined,
          // @ts-ignore
          boxShadow: `0 0 20px rgba(236, 91, 19, 0.2)`,
        }}
      >
        {/* Neon Border Effect */}
        <Box
          className="absolute -top-[2px] -bottom-[2px] -left-[2px] -right-[2px] rounded-2xl opacity-50"
          style={{
            // @ts-ignore
            zIndex: -1,
            // @ts-ignore
            background: `linear-gradient(45deg, ${PRIMARY_COLOR}, ${PRIMARY_DARK}, ${PRIMARY_COLOR})`,
            // @ts-ignore
            filter: 'blur(4px)',
          }}
        />

        {/* Glassmorphism Background */}
        <LinearGradient
          colors={['rgba(34, 22, 16, 0.95)', 'rgba(18, 18, 18, 0.98)']}
          style={{
            borderRadius: 16,
            padding: 24,
            width: '100%',
            overflow: 'hidden',
            borderWidth: 1,
            borderColor: 'rgba(255, 255, 255, 0.1)',
          }}
        >
          {/* Header Section */}
          <ModalHeader className="border-b-0 p-0 mb-6 justify-between items-start">
            <VStack>
              <Heading size="lg" className="text-white font-bold">
                {t('passwordChange.title')}
              </Heading>
              <Text size="sm" className="text-typography-400 mt-1">
                {t('passwordChange.description') || 'Ensure your account stays secure with a strong password.'}
              </Text>
            </VStack>
            {!isForce && (
              <ModalCloseButton onPress={onClose} className="p-1">
                <Icon as={CloseIcon} className="text-typography-400" size="sm" />
              </ModalCloseButton>
            )}
          </ModalHeader>

          <ModalBody className="p-0 mb-6">
            <VStack space="lg">
              {isForce && (
                <Text size="sm" className="text-typography-300 mb-2">
                  {t('passwordChange.forceChangeMessage')}
                </Text>
              )}

              {/* Current Password Field */}
              <FormControl isInvalid={!!currentPasswordError}>
                <FormControlLabel className="mb-1">
                  <FormControlLabelText
                    className="text-typography-400 uppercase font-semibold tracking-[1px]"
                    size="xs"
                  >
                    {t('passwordChange.currentPasswordLabel')}
                  </FormControlLabelText>
                </FormControlLabel>
                <Box className="relative">
                  <Input
                    variant="outline"
                    size="xl"
                    isInvalid={!!currentPasswordError}
                    className="border-white/10 bg-black/40 h-[54px] rounded-lg border pl-10"
                  >
                    {/* Left Icon */}
                    <Box className="absolute left-3 top-[15px] z-10">
                      <Icon as={Lock} className="text-typography-500" size="md" />
                    </Box>

                    <InputField
                      type={showCurrentPassword ? 'text' : 'password'}
                      value={currentPassword}
                      onChangeText={setCurrentPassword}
                      placeholder="••••••••"
                      className="text-white pl-0 text-md"
                      placeholderTextColor="rgba(255,255,255,0.2)"
                    />
                    <InputSlot className="pr-3" onPress={() => setShowCurrentPassword(!showCurrentPassword)}>
                      <InputIcon as={showCurrentPassword ? Eye : EyeOff} className="text-typography-400" />
                    </InputSlot>
                  </Input>
                </Box>
                {currentPasswordError ? (
                  <Text size="xs" className="text-error-400 mt-1">
                    {currentPasswordError.message}
                  </Text>
                ) : null}
              </FormControl>

              {/* New Password Field */}
              <FormControl isInvalid={!!newPasswordError}>
                <FormControlLabel className="mb-1">
                  <FormControlLabelText
                    className="text-typography-400 uppercase font-semibold tracking-[1px]"
                    size="xs"
                  >
                    {t('passwordChange.newPasswordLabel')}
                  </FormControlLabelText>
                </FormControlLabel>
                <Box className="relative">
                  <Input
                    variant="outline"
                    size="xl"
                    isInvalid={!!newPasswordError}
                    className="border-white/10 bg-black/40 h-[54px] rounded-lg border pl-10"
                  >
                    <Box className="absolute left-3 top-[15px] z-10">
                      <Icon as={Lock} className="text-typography-500" size="md" />
                    </Box>
                    <InputField
                      type={showNewPassword ? 'text' : 'password'}
                      value={newPassword}
                      onChangeText={setNewPassword}
                      placeholder="••••••••"
                      className="text-white pl-0 text-md"
                      placeholderTextColor="rgba(255,255,255,0.2)"
                    />
                    <InputSlot className="pr-3" onPress={() => setShowNewPassword(!showNewPassword)}>
                      <InputIcon as={showNewPassword ? Eye : EyeOff} className="text-typography-400" />
                    </InputSlot>
                  </Input>
                </Box>
                {/* Strength bar removed as requested */}
                {newPasswordError ? (
                  <Text size="xs" className="text-error-400 mt-1">
                    {newPasswordError.message}
                  </Text>
                ) : null}
              </FormControl>

              {/* Confirm Password Field */}
              <FormControl isInvalid={!!confirmPasswordError}>
                <FormControlLabel className="mb-1">
                  <FormControlLabelText
                    className="text-typography-400 uppercase font-semibold tracking-[1px]"
                    size="xs"
                  >
                    {t('passwordChange.confirmPasswordLabel') || 'Confirm New Password'}
                  </FormControlLabelText>
                </FormControlLabel>
                <Box className="relative">
                  <Input
                    variant="outline"
                    size="xl"
                    isInvalid={!!confirmPasswordError}
                    className="border-white/10 bg-black/40 h-[54px] rounded-lg border pl-10"
                  >
                    <Box className="absolute left-3 top-[15px] z-10">
                      <Icon as={Lock} className="text-typography-500" size="md" />
                    </Box>
                    <InputField
                      type={showConfirmPassword ? 'text' : 'password'}
                      value={confirmPassword}
                      onChangeText={setConfirmPassword}
                      placeholder="••••••••"
                      className="text-white pl-0 text-md"
                      placeholderTextColor="rgba(255,255,255,0.2)"
                    />
                    <InputSlot className="pr-3" onPress={() => setShowConfirmPassword(!showConfirmPassword)}>
                      <InputIcon as={showConfirmPassword ? Eye : EyeOff} className="text-typography-400" />
                    </InputSlot>
                  </Input>
                </Box>
                {confirmPasswordError ? (
                  <Text size="xs" className="text-error-400 mt-1">
                    {confirmPasswordError.message}
                  </Text>
                ) : null}
              </FormControl>
            </VStack>
          </ModalBody>

          {/* Action Buttons */}
          <VStack space="md">
            <Button
              action="primary"
              onPress={handleUpdate}
              isDisabled={mutation.isPending}
              size="xl"
              className="h-14 rounded-lg"
              style={{
                backgroundColor: PRIMARY_COLOR,
                // @ts-ignore
                boxShadow: `0 4px 14px 0 rgba(236, 91, 19, 0.39)`,
              }}
            >
              {mutation.isPending ? (
                <ButtonSpinner className="mr-2 text-white" />
              ) : (
                <Icon as={RefreshCcw} className="text-white mr-2" size="sm" />
              )}
              <ButtonText className="text-white font-bold" size="md">
                {t('passwordChange.submitButton')}
              </ButtonText>
            </Button>

            {!isForce && (
              <Button
                variant="outline"
                action="secondary"
                onPress={onClose}
                isDisabled={mutation.isPending}
                size="xl"
                className="h-[50px] rounded-lg border-white/10 bg-transparent"
              >
                <ButtonText className="text-white/70 font-medium" size="md">
                  {t('common.cancel')}
                </ButtonText>
              </Button>
            )}
          </VStack>
        </LinearGradient>
      </ModalContent>
    </Modal>
  );
}
