import React from 'react';
import { Toast, ToastTitle, ToastDescription, VStack, HStack, Icon } from '@gluestack-ui/themed';
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
        return <Icon as={CheckCircle2} size="md" color="$green500" mt="$1" />;
      case 'error':
        return <Icon as={AlertTriangle} size="md" color="$red500" mt="$1" />;
      case 'warning':
        return <Icon as={AlertTriangle} size="md" color="$amber500" mt="$1" />;
      case 'info':
      default:
        return <Icon as={Info} size="md" color="$blue500" mt="$1" />;
    }
  };

  const getBorderColor = () => {
    switch (status) {
      case 'success':
        return '$green500';
      case 'error':
        return '$red500';
      case 'warning':
        return '$amber500';
      case 'info':
      default:
        return '$blue500';
    }
  };

  const getBgColor = () => {
    // Using a dark background with slight tint based on status
    return '$backgroundDark900';
  };

  return (
    <Toast
      nativeID={`toast-${id}`}
      action={status}
      variant="outline"
      bg={getBgColor()}
      borderColor={getBorderColor()}
      borderWidth={1}
      rounded="$xl"
      p="$4"
      minWidth="$80"
      maxWidth="$96"
      alignSelf="center"
      mt="$12"
      mx="$4"
      sx={{
        _web: {
          boxShadow: '0 10px 30px -10px rgba(0,0,0,0.5)',
        },
      }}
    >
      <HStack space="md" alignItems="flex-start" flex={1}>
        {getIcon()}
        <VStack space="xs" flex={1}>
          <ToastTitle color="$textLight50" fontWeight="$bold">
            {title}
          </ToastTitle>
          {description && (
            <ToastDescription color="$textLight200" size="sm">
              {description}
            </ToastDescription>
          )}
        </VStack>
        {onClose && (
          <TouchableOpacity onPress={onClose}>
            <Icon as={X} size="sm" color="$textLight400" />
          </TouchableOpacity>
        )}
      </HStack>
    </Toast>
  );
};
