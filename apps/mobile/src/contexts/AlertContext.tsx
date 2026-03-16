import { createContext, useContext, useState, useCallback, useRef } from 'react';
import {
  AlertDialog,
  AlertDialogBackdrop,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogBody,
} from '@/components/ui/alert-dialog';
import { Heading } from '@/components/ui/heading';
import { Text } from '@/components/ui/text';
import { Button, ButtonText } from '@/components/ui/button';
import { HStack } from '@/components/ui/hstack';
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

  const initialFocusRef = useRef(null);

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
        finalFocusRef={initialFocusRef}
      >
        <AlertDialogBackdrop />
        <AlertDialogContent className="bg-background-950 border-outline-800 rounded-2xl">
          <AlertDialogHeader className="border-b-0 justify-between">
            <HStack space="md" className="items-center">
              {options.icon && getIcon()}
              <Heading size="md" className="text-typography-0">
                {title}
              </Heading>
            </HStack>
          </AlertDialogHeader>
          <AlertDialogBody className="mt-2 mb-4">
            <Text size="sm" className="text-typography-400">
              {message}
            </Text>
          </AlertDialogBody>
          <AlertDialogFooter className="border-t-0">
            <HStack space="md" className="flex-wrap justify-end">
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
                      className="border-outline-700"
                    >
                      <ButtonText className="text-typography-400">{btn.text}</ButtonText>
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
                    className={isDestructive ? 'bg-error-600' : 'bg-brand-600'}
                  >
                    <ButtonText className="text-typography-0">{btn.text}</ButtonText>
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
