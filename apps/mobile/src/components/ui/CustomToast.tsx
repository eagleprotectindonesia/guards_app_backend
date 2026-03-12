import React from 'react';
import { Toast, ToastTitle, ToastDescription } from '@/components/ui/toast';
import { VStack } from '@/components/ui/vstack';
import { HStack } from '@/components/ui/hstack';
import { Icon } from '@/components/ui/icon';
import { CheckCircle2, AlertTriangle, Info, X } from 'lucide-react-native';
import { TouchableOpacity } from 'react-native';

type CustomToastProps = {
  id: string;
  status?: 'info' | 'success' | 'warning' | 'error';
  title: string;
  description?: string;
  onClose?: () => void;
};

export const CustomToast = ({ id, status = 'info', title, description, onClose }: CustomToastProps) => {
  const getIcon = () => {
    switch (status) {
      case 'success':
        return <Icon as={CheckCircle2} className="text-success-500 mt-1" />;
      case 'error':
        return <Icon as={AlertTriangle} className="text-error-500 mt-1" />;
      case 'warning':
        return <Icon as={AlertTriangle} className="text-warning-500 mt-1" />;
      case 'info':
      default:
        return <Icon as={Info} className="text-info-500 mt-1" />;
    }
  };

  const getBorderClass = () => {
    switch (status) {
      case 'success':
        return 'border-success-500';
      case 'error':
        return 'border-error-500';
      case 'warning':
        return 'border-warning-500';
      case 'info':
      default:
        return 'border-info-500';
    }
  };

  return (
    <Toast
      nativeID={`toast-${id}`}
      action={status === 'error' ? 'error' : status === 'warning' ? 'warning' : status === 'success' ? 'success' : 'info'}
      variant="outline"
      className={`${getBorderClass()} border bg-background-950 rounded-xl p-4 min-w-[320px] max-w-[384px] self-center mt-12 mx-4 shadow-xl`}
    >
      <HStack space="md" className="items-start flex-1">
        {getIcon()}
        <VStack space="xs" className="flex-1">
          <ToastTitle className="text-typography-50 font-bold">
            {title}
          </ToastTitle>
          {description && (
            <ToastDescription size="sm" className="text-typography-200">
              {description}
            </ToastDescription>
          )}
        </VStack>
        {onClose && (
          <TouchableOpacity onPress={onClose}>
            <Icon as={X} size="sm" className="text-typography-400" />
          </TouchableOpacity>
        )}
      </HStack>
    </Toast>
  );
};
