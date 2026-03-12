import React, { useState } from 'react';
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
import { Eye, EyeOff, Lock, Check, ShieldCheck } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

type PasswordConfirmationModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (password: string) => Promise<void>;
};

export default function PasswordConfirmationModal({ isOpen, onClose, onConfirm }: PasswordConfirmationModalProps) {
  const { t } = useTranslation();
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleConfirm = async () => {
    setIsPending(true);
    setError(null);
    try {
      if (!password) {
        setError(t('passwordConfirmation.error.required'));
        return;
      }
      await onConfirm(password);
      setPassword('');
      onClose();
    } catch {
      setError(t('passwordConfirmation.error.invalid'));
    } finally {
      setIsPending(false);
    }
  };

  // Custom colors based on design
  const PRIMARY_COLOR = '#ec5b13';
  const PRIMARY_DARK = '#8b3105';

  return (
    <Modal isOpen={isOpen} onClose={onClose}>
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
                {t('passwordConfirmation.title')}
              </Heading>
              <Text size="sm" className="text-typography-400 mt-1">
                {t('passwordConfirmation.description')}
              </Text>
            </VStack>
            <ModalCloseButton onPress={onClose} className="p-1">
              <Icon as={CloseIcon} className="text-typography-400" size="sm" />
            </ModalCloseButton>
          </ModalHeader>

          <ModalBody className="p-0 mb-6">
            <VStack space="lg">
              <FormControl isInvalid={!!error}>
                <FormControlLabel className="mb-1">
                  <FormControlLabelText
                    className="text-typography-400 uppercase font-semibold tracking-[1px]"
                    size="xs"
                  >
                    {t('passwordConfirmation.passwordLabel')}
                  </FormControlLabelText>
                </FormControlLabel>
                <Box className="relative">
                  <Input
                    variant="outline"
                    size="xl"
                    isInvalid={!!error}
                    className="border-white/10 bg-black/40 h-[54px] rounded-lg border pl-10"
                  >
                    <Box className="absolute left-3 top-[15px] z-10">
                      <Icon as={Lock} className="text-typography-500" size="md" />
                    </Box>
                    <InputField
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChangeText={setPassword}
                      placeholder={t('passwordConfirmation.passwordPlaceholder')}
                      className="text-white pl-0 text-md"
                      placeholderTextColor="rgba(255,255,255,0.2)"
                      onSubmitEditing={handleConfirm}
                      returnKeyType="done"
                    />
                    <InputSlot className="pr-3" onPress={() => setShowPassword(!showPassword)}>
                      <InputIcon as={showPassword ? Eye : EyeOff} className="text-typography-400" />
                    </InputSlot>
                  </Input>
                </Box>
                {error ? (
                  <Text size="xs" className="text-error-400 mt-1">
                    {error}
                  </Text>
                ) : null}
              </FormControl>
            </VStack>
          </ModalBody>

          {/* Action Buttons */}
          <VStack space="md">
            <Button
              action="primary"
              onPress={handleConfirm}
              isDisabled={isPending}
              size="xl"
              className="h-14 rounded-lg"
              style={{
                backgroundColor: PRIMARY_COLOR,
                // @ts-ignore
                boxShadow: `0 4px 14px 0 rgba(236, 91, 19, 0.39)`,
              }}
            >
              {isPending ? (
                <ButtonSpinner className="mr-2 text-white" />
              ) : (
                <Icon as={Check} className="text-white mr-2" size="sm" />
              )}
              <ButtonText className="text-white font-bold" size="md">
                {t('common.confirm')}
              </ButtonText>
            </Button>

            <Button
              variant="outline"
              action="secondary"
              onPress={onClose}
              isDisabled={isPending}
              size="xl"
              className="h-[50px] rounded-lg border-white/10 bg-transparent"
            >
              <ButtonText className="text-white/70 font-medium" size="md">
                {t('common.cancel')}
              </ButtonText>
            </Button>
          </VStack>

          {/* Footer Note */}
          <Box className="mt-6 pt-4 border-t border-white/5 items-center">
            <Text size="xs" className="text-white/30 flex-row items-center">
              <Icon as={ShieldCheck} className="text-white/30 mr-1" size="xs" />
              Safe & Secure
            </Text>
          </Box>
        </LinearGradient>
      </ModalContent>
    </Modal>
  );
}
