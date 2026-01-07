import React, { useState } from 'react';
import { Alert } from 'react-native';
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

type PasswordChangeModalProps = {
  isOpen: boolean;
  onClose: () => void;
  isForce?: boolean;
};

export default function PasswordChangeModal({ isOpen, onClose, isForce }: PasswordChangeModalProps) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [validationErrors, setValidationErrors] = useState<{ field: string; message: string }[]>([]);
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async () => {
      const response = await client.post('/api/my/profile/change-password', {
        currentPassword,
        newPassword,
      });
      return response.data;
    },
    onSuccess: () => {
      Alert.alert('Sukses', 'Kata sandi berhasil diperbarui!');
      setCurrentPassword('');
      setNewPassword('');
      setValidationErrors([]);
      queryClient.invalidateQueries({ queryKey: ['profile'] });
      onClose();
    },
    onError: (error: any) => {
      const data = error.response?.data;
      if (data?.errors) {
        setValidationErrors(data.errors.map((e: any) => ({
          field: e.path?.[0] || 'unknown',
          message: e.message
        })));
      } else {
        Alert.alert('Error', data?.message || 'Gagal memperbarui kata sandi');
      }
    },
  });

  const handleUpdate = () => {
    setValidationErrors([]);
    if (!currentPassword) {
      setValidationErrors([{ field: 'currentPassword', message: 'Kata sandi saat ini wajib diisi' }]);
      return;
    }
    if (newPassword.length < 8) {
      setValidationErrors([{ field: 'newPassword', message: 'Kata sandi baru harus minimal 8 karakter' }]);
      return;
    }
    mutation.mutate();
  };

  const newPasswordError = validationErrors.find(e => e.field === 'newPassword');
  const currentPasswordError = validationErrors.find(e => e.field === 'currentPassword');

  return (
    <Modal 
      isOpen={isOpen} 
      onClose={isForce ? () => {} : onClose}
      closeOnOverlayClick={!isForce}
    >
      <ModalBackdrop />
      <ModalContent>
        <ModalHeader>
          <Heading size="lg">Ubah Kata Sandi</Heading>
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
                Demi keamanan, Anda diwajibkan untuk mengganti kata sandi saat pertama kali masuk.
              </Text>
            )}
            <FormControl isInvalid={!!currentPasswordError}>
              <FormControlLabel>
                <FormControlLabelText>Kata Sandi Saat Ini</FormControlLabelText>
              </FormControlLabel>
              <Input>
                <InputField
                  type={showCurrentPassword ? 'text' : 'password'}
                  value={currentPassword}
                  onChangeText={setCurrentPassword}
                  placeholder="Masukkan kata sandi saat ini"
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
                <FormControlLabelText>Kata Sandi Baru</FormControlLabelText>
              </FormControlLabel>
              <Input>
                <InputField
                  type={showNewPassword ? 'text' : 'password'}
                  value={newPassword}
                  onChangeText={setNewPassword}
                  placeholder="Masukkan kata sandi baru"
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
              <ButtonText>Batal</ButtonText>
            </Button>
          )}
          <Button action="primary" onPress={handleUpdate} isDisabled={mutation.isPending} ml={isForce ? "$0" : "$3"} className={isForce ? "w-full" : ""}>
            {mutation.isPending && <ButtonSpinner mr="$2" />}
            <ButtonText>Perbarui</ButtonText>
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
