import React, { useState } from 'react';
import { useCustomToast } from '../hooks/useCustomToast';
import {
  Modal,
  ModalBackdrop,
  ModalContent,
  ModalHeader,
  ModalCloseButton,
  ModalBody,
  Heading,
  Icon,
  CloseIcon,
  Button,
  ButtonText,
  VStack,
  FormControl,
  FormControlLabel,
  FormControlLabelText,
  Input,
  InputField,
  InputSlot,
  InputIcon,
  Text,
  ButtonSpinner,
  Box,
} from '@gluestack-ui/themed';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { client } from '../api/client';
import { Eye, EyeOff, Lock, RefreshCcw, ShieldCheck } from 'lucide-react-native';
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
      <ModalBackdrop bg="$backgroundDark950" opacity={0.8} />
      <ModalContent
        bg="transparent"
        p="$0"
        w="$full"
        maxWidth={Platform.OS === 'web' ? 440 : '$full'}
        m="$4"
        rounded="$2xl"
        sx={{
          _web: {
            boxShadow: `0 0 20px rgba(236, 91, 19, 0.2)`,
            backdropFilter: 'blur(12px)',
          },
        }}
      >
        {/* Neon Border Effect */}
        <Box
          position="absolute"
          top={-2}
          bottom={-2}
          left={-2}
          right={-2}
          rounded="$2xl"
          opacity={0.5}
          sx={{
            _web: {
              background: `linear-gradient(45deg, ${PRIMARY_COLOR}, ${PRIMARY_DARK}, ${PRIMARY_COLOR})`,
              filter: 'blur(4px)',
              zIndex: -1,
            },
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
          <ModalHeader borderBottomWidth={0} p="$0" mb="$6" justifyContent="space-between" alignItems="flex-start">
            <VStack>
              <Heading size="lg" color="$white" fontWeight="$bold">
                {t('passwordChange.title')}
              </Heading>
              <Text size="sm" color="$textDark400" mt="$1">
                {t('passwordChange.description') || 'Ensure your account stays secure with a strong password.'}
              </Text>
            </VStack>
            {!isForce && (
              <ModalCloseButton onPress={onClose} p="$1">
                <Icon as={CloseIcon} color="$textDark400" size="sm" />
              </ModalCloseButton>
            )}
          </ModalHeader>

          <ModalBody p="$0" mb="$6">
            <VStack space="lg">
              {isForce && (
                <Text size="sm" color="$textDark300" mb="$2">
                  {t('passwordChange.forceChangeMessage')}
                </Text>
              )}

              {/* Current Password Field */}
              <FormControl isInvalid={!!currentPasswordError}>
                <FormControlLabel mb="$1">
                  <FormControlLabelText
                    color="$textDark400"
                    size="xs"
                    textTransform="uppercase"
                    fontWeight="$semibold"
                    letterSpacing={1}
                  >
                    {t('passwordChange.currentPasswordLabel')}
                  </FormControlLabelText>
                </FormControlLabel>
                <Box position="relative">
                  <Input
                    variant="outline"
                    size="xl"
                    isDisabled={false}
                    isInvalid={!!currentPasswordError}
                    isReadOnly={false}
                    borderColor="rgba(255,255,255,0.1)"
                    bg="rgba(0,0,0,0.4)"
                    h={54}
                    rounded="$lg"
                    borderWidth={1}
                    pl="$10" // Space for icon
                    $focus-borderColor={PRIMARY_COLOR}
                    $focus-borderWidth={1}
                  >
                    {/* Left Icon */}
                    <Box position="absolute" left={12} top={15} zIndex={1}>
                      <Icon as={Lock} color="$textDark500" size="md" />
                    </Box>

                    <InputField
                      type={showCurrentPassword ? 'text' : 'password'}
                      value={currentPassword}
                      onChangeText={setCurrentPassword}
                      placeholder="••••••••"
                      color="$white"
                      placeholderTextColor="rgba(255,255,255,0.2)"
                      fontSize="$md"
                      pl="$0"
                    />
                    <InputSlot pr="$3" onPress={() => setShowCurrentPassword(!showCurrentPassword)}>
                      <InputIcon as={showCurrentPassword ? Eye : EyeOff} color="$textDark400" />
                    </InputSlot>
                  </Input>
                </Box>
                {currentPasswordError && (
                  <Text size="xs" color="$red400" mt="$1">
                    {currentPasswordError.message}
                  </Text>
                )}
              </FormControl>

              {/* New Password Field */}
              <FormControl isInvalid={!!newPasswordError}>
                <FormControlLabel mb="$1">
                  <FormControlLabelText
                    color="$textDark400"
                    size="xs"
                    textTransform="uppercase"
                    fontWeight="$semibold"
                    letterSpacing={1}
                  >
                    {t('passwordChange.newPasswordLabel')}
                  </FormControlLabelText>
                </FormControlLabel>
                <Box position="relative">
                  <Input
                    variant="outline"
                    size="xl"
                    isDisabled={false}
                    isInvalid={!!newPasswordError}
                    isReadOnly={false}
                    borderColor="rgba(255,255,255,0.1)"
                    bg="rgba(0,0,0,0.4)"
                    h={54}
                    rounded="$lg"
                    borderWidth={1}
                    pl="$10"
                    $focus-borderColor={PRIMARY_COLOR}
                    $focus-borderWidth={1}
                  >
                    <Box position="absolute" left={12} top={15} zIndex={1}>
                      <Icon as={Lock} color="$textDark500" size="md" />
                    </Box>
                    <InputField
                      type={showNewPassword ? 'text' : 'password'}
                      value={newPassword}
                      onChangeText={setNewPassword}
                      placeholder="••••••••"
                      color="$white"
                      placeholderTextColor="rgba(255,255,255,0.2)"
                      fontSize="$md"
                      pl="$0"
                    />
                    <InputSlot pr="$3" onPress={() => setShowNewPassword(!showNewPassword)}>
                      <InputIcon as={showNewPassword ? Eye : EyeOff} color="$textDark400" />
                    </InputSlot>
                  </Input>
                </Box>
                {/* Strength bar removed as requested */}
                {newPasswordError && (
                  <Text size="xs" color="$red400" mt="$1">
                    {newPasswordError.message}
                  </Text>
                )}
              </FormControl>

              {/* Confirm Password Field */}
              <FormControl isInvalid={!!confirmPasswordError}>
                <FormControlLabel mb="$1">
                  <FormControlLabelText
                    color="$textDark400"
                    size="xs"
                    textTransform="uppercase"
                    fontWeight="$semibold"
                    letterSpacing={1}
                  >
                    {t('passwordChange.confirmPasswordLabel') || 'Confirm New Password'}
                  </FormControlLabelText>
                </FormControlLabel>
                <Box position="relative">
                  <Input
                    variant="outline"
                    size="xl"
                    isDisabled={false}
                    isInvalid={!!confirmPasswordError}
                    isReadOnly={false}
                    borderColor="rgba(255,255,255,0.1)"
                    bg="rgba(0,0,0,0.4)"
                    h={54}
                    rounded="$lg"
                    borderWidth={1}
                    pl="$10"
                    $focus-borderColor={PRIMARY_COLOR}
                    $focus-borderWidth={1}
                  >
                    <Box position="absolute" left={12} top={15} zIndex={1}>
                      <Icon as={Lock} color="$textDark500" size="md" />
                    </Box>
                    <InputField
                      type={showConfirmPassword ? 'text' : 'password'}
                      value={confirmPassword}
                      onChangeText={setConfirmPassword}
                      placeholder="••••••••"
                      color="$white"
                      placeholderTextColor="rgba(255,255,255,0.2)"
                      fontSize="$md"
                      pl="$0"
                    />
                    <InputSlot pr="$3" onPress={() => setShowConfirmPassword(!showConfirmPassword)}>
                      <InputIcon as={showConfirmPassword ? Eye : EyeOff} color="$textDark400" />
                    </InputSlot>
                  </Input>
                </Box>
                {confirmPasswordError && (
                  <Text size="xs" color="$red400" mt="$1">
                    {confirmPasswordError.message}
                  </Text>
                )}
              </FormControl>
            </VStack>
          </ModalBody>

          {/* Action Buttons */}
          <VStack space="md">
            <Button
              action="primary"
              onPress={handleUpdate}
              isDisabled={mutation.isPending}
              bg={PRIMARY_COLOR}
              size="xl"
              h={56}
              rounded="$lg"
              $active-bg={PRIMARY_DARK}
              $active-transform={[{ scale: 0.98 }]}
              sx={{
                _web: {
                  boxShadow: `0 4px 14px 0 rgba(236, 91, 19, 0.39)`,
                },
              }}
            >
              {mutation.isPending ? (
                <ButtonSpinner mr="$2" color="$white" />
              ) : (
                <Icon as={RefreshCcw} color="$white" mr="$2" size="sm" />
              )}
              <ButtonText color="$white" fontWeight="$bold" fontSize="$md">
                {t('passwordChange.submitButton')}
              </ButtonText>
            </Button>

            {!isForce && (
              <Button
                variant="outline"
                action="secondary"
                onPress={onClose}
                isDisabled={mutation.isPending}
                borderColor="rgba(255,255,255,0.1)"
                bg="transparent"
                size="xl"
                h={50}
                rounded="$lg"
                $hover-bg="rgba(255,255,255,0.05)"
              >
                <ButtonText color="rgba(255,255,255,0.7)" fontWeight="$medium" fontSize="$md">
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
