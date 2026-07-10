import React, { useCallback } from 'react';
import { format } from 'date-fns';
import * as Haptics from 'expo-haptics';
import * as Location from 'expo-location';
import { LinearGradient } from 'expo-linear-gradient';
import { LogOut, MapPin, Clock, Star } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ShiftWithRelations } from '@repo/types';
import { CheckInWindowResult } from '@repo/shared';
import { useAlert } from '../contexts/AlertContext';
import { useCustomToast } from '../hooks/useCustomToast';
import { client } from '../api/client';
import { queryKeys } from '../api/queryKeys';
import { Box } from '@/components/ui/box';
import { Heading } from '@/components/ui/heading';
import { HStack } from '@/components/ui/hstack';
import { Pressable } from '@/components/ui/pressable';
import { Spinner } from '@/components/ui/spinner';
import { Text } from '@/components/ui/text';
import { VStack } from '@/components/ui/vstack';

interface EventInfoCardProps {
  shift: ShiftWithRelations;
  eventType: string;
  eventName: string;
  refetchShift: () => void;
  checkInWindow?: CheckInWindowResult;
}

export default function EventInfoCard({
  shift,
  eventType,
  eventName,
  refetchShift,
  checkInWindow,
}: EventInfoCardProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const toast = useCustomToast();
  const { showAlert } = useAlert();
  const now = new Date();
  const endsAt = new Date(shift.endsAt);
  const canEnd = checkInWindow ? checkInWindow.status === 'open' || checkInWindow.status === 'late' : now >= endsAt;

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
      const code = error?.response?.data?.code;
      if (code === 'too_early_to_end') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        toast.error(t('common.error'), t('dashboard.tooEarlyToEnd'));
        return;
      }
      if (code === 'too_far_from_site') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        toast.error(t('common.error'), error?.response?.data?.error);
        return;
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      toast.error(t('common.error'), error?.response?.data?.error || error.message);
    },
  });

  const handleEndDutyPress = useCallback(() => {
    showAlert(
      t('dashboard.endDutyConfirmTitle'),
      t('dashboard.endDutyConfirmMessage'),
      [
        { text: t('common.cancel'), style: 'destructive' },
        {
          text: t('dashboard.endDutyConfirmAction'),
          style: 'cancel',
          onPress: () => completeMutation.mutate(),
        },
      ],
      { icon: 'warning' }
    );
  }, [completeMutation, showAlert, t]);

  return (
    <Box className="rounded-[32px] overflow-hidden bg-background-900 border border-outline-800 relative p-6">
      <VStack space="md">
        <HStack space="md" className="items-center">
          <Box className="w-10 h-10 rounded-xl bg-warning-500/15 items-center justify-center border border-warning-500/30">
            <Star size={20} color="#F59E0B" />
          </Box>
          <VStack>
            <Text size="xs" className="text-typography-500 uppercase tracking-[1.5px] font-semibold">
              Event Shift
            </Text>
            <Heading size="sm" className="text-white font-bold">
              {eventName}
            </Heading>
          </VStack>
        </HStack>

        <Box className="bg-warning-500/15 border border-warning-500/30 px-3 py-1.5 rounded-full self-start">
          <Text size="sm" className="text-warning-500 font-bold uppercase tracking-[1px]">
            {eventType}
          </Text>
        </Box>

        <Box className="h-[1px] w-full bg-white/10" />

        <HStack space="sm" className="items-start">
          <MapPin size={16} color="#F59E0B" style={{ marginTop: 2 }} />
          <Text size="sm" className="text-typography-300 flex-1">
            {shift.site?.address || shift.site?.name || 'No location'}
          </Text>
        </HStack>

        <HStack space="sm" className="items-center">
          <Clock size={16} color="#737373" />
          <Text size="sm" className="text-typography-400">
            {format(new Date(shift.startsAt), 'HH:mm')} — {format(new Date(shift.endsAt), 'HH:mm')}
          </Text>
        </HStack>

        <VStack space="sm">
          <Pressable onPress={canEnd ? handleEndDutyPress : undefined} disabled={!canEnd || completeMutation.isPending}>
            {({ pressed }) => (
              <LinearGradient
                colors={canEnd ? ['#DC2626', '#991B1B'] : ['#334155', '#1E293B']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={{
                  borderRadius: 16,
                  paddingVertical: 16,
                  opacity: pressed ? 0.9 : 1,
                  transform: [{ scale: pressed ? 0.985 : 1 }],
                }}
              >
                <HStack space="sm" className="justify-center items-center">
                  {completeMutation.isPending ? <Spinner className="text-white" /> : <LogOut size={18} color="white" />}
                  <Text className="text-white font-bold uppercase tracking-[1px]">{t('dashboard.endDuty')}</Text>
                </HStack>
              </LinearGradient>
            )}
          </Pressable>

          {!canEnd ? (
            <Text size="sm" className="text-typography-500 text-center mt-1">
              {t('dashboard.cannotEndUntil', { time: format(endsAt, 'HH:mm') })}
            </Text>
          ) : null}
        </VStack>
      </VStack>
    </Box>
  );
}
