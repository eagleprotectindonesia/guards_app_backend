import React, { createContext, useContext, useState, useCallback } from 'react';
import {
  AlertDialog,
  AlertDialogBackdrop,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogCloseButton,
  AlertDialogFooter,
  AlertDialogBody,
  Heading,
  Text,
  Button,
  ButtonText,
  Icon,
  CloseIcon,
  HStack,
} from '@gluestack-ui/themed';
import { AlertTriangle, CheckCircle2, Info } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';

type AlertButton = {
  text: string;
  onPress?: () => void;
  style?: 'default' | 'cancel' | 'destructive';
};

type AlertOptions = {
  cancelable?: boolean;
  onDismiss?: () => void;
  icon?: 'success' | 'error' | 'info' | 'warning';
};

type AlertContextType = {
  showAlert: (title: string, message?: string, buttons?: AlertButton[], options?: AlertOptions) => void;
};

const AlertContext = createContext<AlertContextType | undefined>(undefined);

export const useAlert = () => {
  const context = useContext(AlertContext);
  if (!context) {
    throw new Error('useAlert must be used within an AlertProvider');
  }
  return context;
};

export const AlertProvider = ({ children }: { children: React.ReactNode }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [buttons, setButtons] = useState<AlertButton[]>([]);
  const [options, setOptions] = useState<AlertOptions>({});

  const showAlert = useCallback(
    (alertTitle: string, alertMessage?: string, alertButtons?: AlertButton[], alertOptions?: AlertOptions) => {
      setTitle(alertTitle);
      setMessage(alertMessage || '');
      setButtons(
        alertButtons || [
          {
            text: 'OK',
            style: 'default',
            onPress: () => {},
          },
        ]
      );
      setOptions(alertOptions || {});
      setIsOpen(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    },
    []
  );

  const handleClose = () => {
    setIsOpen(false);
    if (options.onDismiss) {
      options.onDismiss();
    }
  };

  const initialFocusRef = React.useRef(null);

  const getIcon = () => {
    switch (options.icon) {
      case 'success':
        return <CheckCircle2 size={32} color="#10B981" />;
      case 'error':
        return <AlertTriangle size={32} color="#EF4444" />;
      case 'warning':
        return <AlertTriangle size={32} color="#F59E0B" />;
      case 'info':
      default:
        return <Info size={32} color="#3B82F6" />;
    }
  };

  return (
    <AlertContext.Provider value={{ showAlert }}>
      {children}
      <AlertDialog
        isOpen={isOpen}
        onClose={options.cancelable === false ? () => {} : handleClose}
        initialFocusRef={initialFocusRef}
      >
        <AlertDialogBackdrop />
        <AlertDialogContent
          bg="$backgroundDark900"
          borderColor="$borderDark700"
          borderWidth={1}
          rounded="$2xl"
          sx={{
            _web: {
              boxShadow: '0 0 20px rgba(0,0,0,0.5)',
            },
          }}
        >
          <AlertDialogHeader borderBottomWidth={0} justifyContent="space-between">
            <HStack space="md" alignItems="center">
              {options.icon && getIcon()}
              <Heading size="md" color="$white">
                {title}
              </Heading>
            </HStack>
            {!options.cancelable && options.cancelable !== undefined ? null : (
              <AlertDialogCloseButton onPress={handleClose}>
                <Icon as={CloseIcon} color="$textDark400" />
              </AlertDialogCloseButton>
            )}
          </AlertDialogHeader>
          <AlertDialogBody mt="$2" mb="$4">
            <Text size="sm" color="$textDark300">
              {message}
            </Text>
          </AlertDialogBody>
          <AlertDialogFooter borderTopWidth={0}>
            <HStack space="md" flexWrap="wrap" justifyContent="flex-end">
              {buttons.map((btn, index) => {
                const isDestructive = btn.style === 'destructive';
                const isCancel = btn.style === 'cancel';

                if (isCancel) {
                  return (
                    <Button
                      key={index}
                      variant="outline"
                      action="secondary"
                      onPress={() => {
                        setIsOpen(false);
                        if (btn.onPress) btn.onPress();
                      }}
                      borderColor="$borderDark700"
                    >
                      <ButtonText color="$textDark300">{btn.text}</ButtonText>
                    </Button>
                  );
                }

                return (
                  <Button
                    key={index}
                    variant="solid"
                    action={isDestructive ? 'negative' : 'primary'}
                    onPress={() => {
                      setIsOpen(false);
                      if (btn.onPress) btn.onPress();
                    }}
                    bg={isDestructive ? '$red600' : '$blue600'}
                    sx={{
                      ':active': {
                        bg: isDestructive ? '$red700' : '$blue700',
                      },
                    }}
                  >
                    <ButtonText color="$white">{btn.text}</ButtonText>
                  </Button>
                );
              })}
            </HStack>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AlertContext.Provider>
  );
};
