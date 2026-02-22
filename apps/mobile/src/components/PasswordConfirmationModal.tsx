import React, { useState } from 'react';
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
  ButtonSpinner,
  Text,
  Box,
} from '@gluestack-ui/themed';
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
                {t('passwordConfirmation.title')}
              </Heading>
              <Text size="sm" color="$textDark400" mt="$1">
                {t('passwordConfirmation.description')}
              </Text>
            </VStack>
            <ModalCloseButton onPress={onClose} p="$1">
              <Icon as={CloseIcon} color="$textDark400" size="sm" />
            </ModalCloseButton>
          </ModalHeader>

          <ModalBody p="$0" mb="$6">
            <VStack space="lg">
              <FormControl isInvalid={!!error}>
                <FormControlLabel mb="$1">
                  <FormControlLabelText
                    color="$textDark400"
                    size="xs"
                    textTransform="uppercase"
                    fontWeight="$semibold"
                    letterSpacing={1}
                  >
                    {t('passwordConfirmation.passwordLabel')}
                  </FormControlLabelText>
                </FormControlLabel>
                <Box position="relative">
                  <Input
                    variant="outline"
                    size="xl"
                    isDisabled={false}
                    isInvalid={!!error}
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
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChangeText={setPassword}
                      placeholder={t('passwordConfirmation.passwordPlaceholder')}
                      color="$white"
                      placeholderTextColor="rgba(255,255,255,0.2)"
                      fontSize="$md"
                      pl="$0"
                      onSubmitEditing={handleConfirm}
                      returnKeyType="done"
                    />
                    <InputSlot pr="$3" onPress={() => setShowPassword(!showPassword)}>
                      <InputIcon as={showPassword ? Eye : EyeOff} color="$textDark400" />
                    </InputSlot>
                  </Input>
                </Box>
                {error && (
                  <Text size="xs" color="$red400" mt="$1">
                    {error}
                  </Text>
                )}
              </FormControl>
            </VStack>
          </ModalBody>

          {/* Action Buttons */}
          <VStack space="md">
            <Button
              action="primary"
              onPress={handleConfirm}
              isDisabled={isPending}
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
              {isPending ? (
                <ButtonSpinner mr="$2" color="$white" />
              ) : (
                <Icon as={Check} color="$white" mr="$2" size="sm" />
              )}
              <ButtonText color="$white" fontWeight="$bold" fontSize="$md">
                {t('common.confirm')}
              </ButtonText>
            </Button>

            <Button
              variant="outline"
              action="secondary"
              onPress={onClose}
              isDisabled={isPending}
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
          </VStack>

          {/* Footer Note */}
          <Box mt="$6" pt="$4" borderTopWidth={1} borderTopColor="rgba(255,255,255,0.05)" alignItems="center">
            <Text size="xs" color="rgba(255,255,255,0.3)" display="flex" alignItems="center">
              <Icon as={ShieldCheck} color="rgba(255,255,255,0.3)" size="xs" mr="$1" />
              Safe & Secure
            </Text>
          </Box>
        </LinearGradient>
      </ModalContent>
    </Modal>
  );
}
