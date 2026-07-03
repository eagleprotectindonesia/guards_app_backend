import React from 'react';
import { useCustomToast } from '../hooks/useCustomToast';
import { Box } from '@/components/ui/box';
import { Heading } from '@/components/ui/heading';
import { Text } from '@/components/ui/text';
import { VStack } from '@/components/ui/vstack';
import { HStack } from '@/components/ui/hstack';
import { Button, ButtonText, ButtonSpinner } from '@/components/ui/button';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { client } from '../api/client';
import { useTranslation } from 'react-i18next';
import { ShiftWithRelations } from '@repo/types';
import * as Haptics from 'expo-haptics';
import { LogOut, MapPin, CheckCircle } from 'lucide-react-native';
import { queryKeys } from '../api/queryKeys';

type EscortDutyCardProps = {
  shift: ShiftWithRelations;
  refetchShift: () => void;
};

export default function EscortDutyCard({ shift, refetchShift }: EscortDutyCardProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const toast = useCustomToast();

  const departed = !!shift.departedAt;
  const arrived = !!shift.arrivedAt;

  const departMutation = useMutation({
    mutationFn: async () => {
      const res = await client.post(`/api/employee/shifts/${shift.id}/depart`);
      return res.data;
    },
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      queryClient.invalidateQueries({ queryKey: queryKeys.shifts.active });
      refetchShift();
    },
    onError: (error: any) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      toast.error(t('common.error'), error?.response?.data?.error || error.message);
    },
  });

  const arriveMutation = useMutation({
    mutationFn: async () => {
      const res = await client.post(`/api/employee/shifts/${shift.id}/arrive`);
      return res.data;
    },
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      queryClient.invalidateQueries({ queryKey: queryKeys.shifts.active });
      refetchShift();
    },
    onError: (error: any) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      toast.error(t('common.error'), error?.response?.data?.error || error.message);
    },
  });

  const completeMutation = useMutation({
    mutationFn: async () => {
      const res = await client.post(`/api/employee/shifts/${shift.id}/complete`);
      return res.data;
    },
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      queryClient.invalidateQueries({ queryKey: queryKeys.shifts.active });
      refetchShift();
      toast.success(t('common.success'), t('dashboard.shiftCompleted'));
    },
    onError: (error: any) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      toast.error(t('common.error'), error?.response?.data?.error || error.message);
    },
  });

  return (
    <Box className="rounded-[32px] overflow-hidden bg-background-900 border border-outline-800 mb-6 shadow-xl">
      <Box className="p-6">
        <Heading size="sm" className="text-white mb-4 text-center">
          {t('dashboard.escortDuty', 'Escort Duty')}
        </Heading>

        <HStack space="sm" className="justify-center">
          <Button
            variant="outline"
            className="flex-1"
            onPress={() => departMutation.mutate()}
            isDisabled={departed || departMutation.isPending}
          >
            {departMutation.isPending ? (
              <ButtonSpinner />
            ) : (
              <LogOut size={16} color={departed ? '#22C55E' : '#94A3B8'} />
            )}
            <ButtonText className={departed ? 'text-success-400' : ''}>
              {departed ? t('dashboard.left', 'Left') : t('dashboard.leaveLocation', 'Leave')}
            </ButtonText>
          </Button>

          <Button
            variant="outline"
            className="flex-1"
            onPress={() => arriveMutation.mutate()}
            isDisabled={!departed || arrived || arriveMutation.isPending}
          >
            {arriveMutation.isPending ? (
              <ButtonSpinner />
            ) : (
              <MapPin size={16} color={arrived ? '#22C55E' : '#94A3B8'} />
            )}
            <ButtonText className={arrived ? 'text-success-400' : ''}>
              {arrived ? t('dashboard.arrived', 'Arrived') : t('dashboard.arriveLocation', 'Arrive')}
            </ButtonText>
          </Button>

          <Button
            variant="outline"
            className="flex-1"
            onPress={() => completeMutation.mutate()}
            isDisabled={completeMutation.isPending}
          >
            {completeMutation.isPending ? (
              <ButtonSpinner />
            ) : (
              <CheckCircle size={16} color="#EF4444" />
            )}
            <ButtonText>
              {t('dashboard.endDuty', 'End')}
            </ButtonText>
          </Button>
        </HStack>
      </Box>
    </Box>
  );
}
