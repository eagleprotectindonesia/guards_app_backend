import React from 'react';
import { useToast as useGluestackToast } from '@gluestack-ui/themed';
import { CustomToast } from '../components/ui/CustomToast';

interface ShowToastParams {
  title: string;
  description?: string;
  status?: 'info' | 'success' | 'warning' | 'error';
  duration?: number;
  placement?: 'top' | 'bottom';
}

export const useCustomToast = () => {
  const toast = useGluestackToast();

  const showToast = ({ title, description, status = 'info', duration = 3000, placement = 'top' }: ShowToastParams) => {
    toast.show({
      placement,
      duration,
      render: ({ id }: { id: string }) => {
        return (
          <CustomToast
            id={id}
            status={status}
            title={title}
            description={description}
            onClose={() => toast.close(id)}
          />
        );
      },
    });
  };

  const success = (title: string, description?: string) => showToast({ title, description, status: 'success' });
  const error = (title: string, description?: string) => showToast({ title, description, status: 'error' });
  const warning = (title: string, description?: string) => showToast({ title, description, status: 'warning' });
  const info = (title: string, description?: string) => showToast({ title, description, status: 'info' });

  return {
    showToast,
    success,
    error,
    warning,
    info,
    toast,
  };
};
