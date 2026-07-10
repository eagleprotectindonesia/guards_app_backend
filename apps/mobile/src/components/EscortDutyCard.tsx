import React from 'react';
import { useCustomToast } from '../hooks/useCustomToast';
import { Box } from '@/components/ui/box';
import { Heading } from '@/components/ui/heading';
import { VStack } from '@/components/ui/vstack';
import { Button, ButtonText, ButtonSpinner } from '@/components/ui/button';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { client } from '../api/client';
import { useTranslation } from 'react-i18next';
import { ShiftWithRelations } from '@repo/types';
import * as Haptics from 'expo-haptics';
import * as Location from 'expo-location';
import { CheckCircle } from 'lucide-react-native';
import { queryKeys } from '../api/queryKeys';

type EscortDutyCardProps = {
  shift: ShiftWithRelations;
  refetchShift: () => void;
};

export default function EscortDutyCard({ shift, refetchShift }: EscortDutyCardProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const toast = useCustomToast();

  const flexibleEndTime = shift.groupShift?.flexibleEndTime ?? false;
  const now = new Date();
  const endsAt = new Date(shift.endsAt);
  const canEnd = flexibleEndTime || now >= endsAt;

  const completeMutation = useMutation({
    mutationFn: async () => {
      let location;
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === 'granted') {
          const pos = await Location.getCurrentPositionAsync({});
          location = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        }
      } catch {}

      const res = await client.post(`/api/employee/shifts/${shift.id}/complete`, { location });
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
          {t('dashboard.escortDuty')}
        </Heading>

        <VStack space="sm">
          <Button
            variant="outline"
            className="bg-white/5 border-white/10 self-center"
            onPress={() => completeMutation.mutate()}
            isDisabled={!canEnd || completeMutation.isPending}
          >
            {completeMutation.isPending ? <ButtonSpinner /> : <CheckCircle size={16} color="#EF4444" />}
            <ButtonText className="text-typography-400">{t('dashboard.endDuty')}</ButtonText>
          </Button>
        </VStack>
      </Box>
    </Box>
  );
}
