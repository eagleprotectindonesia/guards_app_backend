import React, { useState } from 'react';
import {
  Modal,
  ModalBackdrop,
  ModalContent,
  ModalHeader,
  ModalCloseButton,
  ModalBody,
  ModalFooter,
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
} from '@gluestack-ui/themed';
import { Eye, EyeOff } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';

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

  const handleConfirm = async () => {
    setIsPending(true);
    try {
      await onConfirm(password);
      setPassword(''); // clear on success
      // onClose is called by parent usually on success, or we call it here?
      // If we call it here, we assume onConfirm throws on error.
    } catch {
      // Parent handles error presentation
    } finally {
      setIsPending(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose}>
      <ModalBackdrop />
      <ModalContent>
        <ModalHeader>
          <Heading size="lg">{t('biometric.enableTitle')}</Heading>
          <ModalCloseButton>
            <Icon as={CloseIcon} />
          </ModalCloseButton>
        </ModalHeader>
        <ModalBody>
          <VStack space="md">
            <FormControl>
              <FormControlLabel>
                <FormControlLabelText>{t('login.passwordLabel')}</FormControlLabelText>
              </FormControlLabel>
              <Input>
                <InputField
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChangeText={setPassword}
                  placeholder={t('login.passwordPlaceholder')}
                  autoCapitalize="none"
                />
                <InputSlot pr="$3" onPress={() => setShowPassword(!showPassword)}>
                  <InputIcon as={showPassword ? Eye : EyeOff} color="$gray500" />
                </InputSlot>
              </Input>
            </FormControl>
          </VStack>
        </ModalBody>
        <ModalFooter>
          <Button variant="outline" action="secondary" onPress={onClose} isDisabled={isPending} mr="$3">
            <ButtonText>{t('common.cancel')}</ButtonText>
          </Button>
          <Button action="primary" onPress={handleConfirm} isDisabled={isPending || !password}>
            {isPending && <ButtonSpinner mr="$2" />}
            <ButtonText>{t('common.confirm')}</ButtonText>
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
