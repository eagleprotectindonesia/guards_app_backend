import React, { useState } from 'react';
import { useCustomToast } from '../hooks/useCustomToast';
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
  Text,
  ButtonSpinner,
} from '@gluestack-ui/themed';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { client } from '../api/client';
import { Eye, EyeOff } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { queryKeys } from '../api/queryKeys';

type PasswordChangeModalProps = {
  isOpen: boolean;
  onClose: () => void;
  isForce?: boolean;
};

export default function PasswordChangeModal({ isOpen, onClose, isForce }: PasswordChangeModalProps) {
  const { t } = useTranslation();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
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
      setCurrentPassword('');
      setNewPassword('');
      setValidationErrors([]);
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

  const handleUpdate = () => {
    setValidationErrors([]);
    if (!currentPassword) {
      setValidationErrors([{ field: 'currentPassword', message: t('passwordChange.currentPasswordRequired') }]);
      return;
    }
    if (newPassword.length < 8) {
      setValidationErrors([{ field: 'newPassword', message: t('passwordChange.newPasswordMinLength') }]);
      return;
    }
    mutation.mutate();
  };

  const newPasswordError = validationErrors.find(e => e.field === 'newPassword');
  const currentPasswordError = validationErrors.find(e => e.field === 'currentPassword');

  return (
    <Modal isOpen={isOpen} onClose={isForce ? () => {} : onClose} closeOnOverlayClick={!isForce}>
      <ModalBackdrop />
      <ModalContent>
        <ModalHeader>
          <Heading size="lg">{t('passwordChange.title')}</Heading>
          {!isForce && (
            <ModalCloseButton>
              <Icon as={CloseIcon} />
            </ModalCloseButton>
          )}
        </ModalHeader>
        <ModalBody>
          <VStack space="md">
            {isForce && (
              <Text size="sm" color="$gray500" className="mb-2">
                {t('passwordChange.forceChangeMessage')}
              </Text>
            )}
            <FormControl isInvalid={!!currentPasswordError}>
              <FormControlLabel>
                <FormControlLabelText>{t('passwordChange.currentPasswordLabel')}</FormControlLabelText>
              </FormControlLabel>
              <Input>
                <InputField
                  type={showCurrentPassword ? 'text' : 'password'}
                  value={currentPassword}
                  onChangeText={setCurrentPassword}
                  placeholder={t('passwordChange.currentPasswordPlaceholder')}
                />
                <InputSlot pr="$3" onPress={() => setShowCurrentPassword(!showCurrentPassword)}>
                  <InputIcon as={showCurrentPassword ? Eye : EyeOff} color="$gray500" />
                </InputSlot>
              </Input>
              {currentPasswordError && (
                <Text size="xs" color="$red600" className="mt-1">
                  {currentPasswordError.message}
                </Text>
              )}
            </FormControl>

            <FormControl isInvalid={!!newPasswordError}>
              <FormControlLabel>
                <FormControlLabelText>{t('passwordChange.newPasswordLabel')}</FormControlLabelText>
              </FormControlLabel>
              <Input>
                <InputField
                  type={showNewPassword ? 'text' : 'password'}
                  value={newPassword}
                  onChangeText={setNewPassword}
                  placeholder={t('passwordChange.newPasswordPlaceholder')}
                />
                <InputSlot pr="$3" onPress={() => setShowNewPassword(!showNewPassword)}>
                  <InputIcon as={showNewPassword ? Eye : EyeOff} color="$gray500" />
                </InputSlot>
              </Input>
              {newPasswordError && (
                <Text size="xs" color="$red600" className="mt-1">
                  {newPasswordError.message}
                </Text>
              )}
            </FormControl>
          </VStack>
        </ModalBody>
        <ModalFooter>
          {!isForce && (
            <Button variant="outline" action="secondary" onPress={onClose} isDisabled={mutation.isPending}>
              <ButtonText>{t('common.cancel')}</ButtonText>
            </Button>
          )}
          <Button
            action="primary"
            onPress={handleUpdate}
            isDisabled={mutation.isPending}
            ml={isForce ? '$0' : '$3'}
            className={isForce ? 'w-full' : ''}
          >
            {mutation.isPending && <ButtonSpinner mr="$2" />}
            <ButtonText>{t('passwordChange.submitButton')}</ButtonText>
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
