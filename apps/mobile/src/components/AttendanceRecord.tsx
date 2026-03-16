import React, { useState } from 'react';
import { useCustomToast } from '../hooks/useCustomToast';
import { Box } from '@/components/ui/box';
import { Button, ButtonText, ButtonSpinner } from '@/components/ui/button';
import { Heading } from '@/components/ui/heading';
import { Text } from '@/components/ui/text';
import { VStack } from '@/components/ui/vstack';
import * as Location from 'expo-location';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { client } from '../api/client';
import { useTranslation } from 'react-i18next';
import { ShiftWithRelations } from '@repo/types';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { queryKeys } from '../api/queryKeys';

type AttendanceRecordProps = {
  shift: ShiftWithRelations;
  onAttendanceRecorded?: () => void;
};

export default function AttendanceRecord({ shift, onAttendanceRecorded }: AttendanceRecordProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<string>('');
  const toast = useCustomToast();

  const attendanceMutation = useMutation({
    mutationFn: async (location: { lat: number; lng: number }) => {
      const response = await client.post(`/api/employee/shifts/${shift.id}/attendance`, {
        shiftId: shift.id,
        location,
      });
      return response.data;
    },
    onSuccess: async () => {
      setStatus(t('attendance.success'));
      queryClient.invalidateQueries({ queryKey: queryKeys.shifts.active });
      if (onAttendanceRecorded) onAttendanceRecorded();
    },
    onError: (error: any) => {
      const msg = error.response?.data?.error || error.message || t('attendance.fail');
      setStatus(t('attendance.failPrefix') + msg);
      toast.error('Error', msg);
    },
  });

  const handleRecordAttendance = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setStatus(t('attendance.requestingPermission'));
    let { status: permStatus } = await Location.requestForegroundPermissionsAsync();

    if (permStatus !== 'granted') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setStatus(t('attendance.permissionDenied'));
      toast.error(t('attendance.permissionDeniedTitle'), t('attendance.locationRequired'));
      return;
    }

    setStatus(t('attendance.gettingLocation'));
    try {
      let location = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });

      setStatus(t('attendance.recording'));
      attendanceMutation.mutate({
        lat: location.coords.latitude,
        lng: location.coords.longitude,
      });
    } catch (err) {
      console.error(err);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setStatus(t('attendance.locationFetchError'));
      toast.error(t('attendance.locationErrorTitle'), t('attendance.locationErrorMessage'));
    }
  };

  const hasAttendance = !!shift.attendance;

  // Calculate late status
  const ATTENDANCE_GRACE_MINS = 5;
  const now = new Date();
  const startMs = new Date(shift.startsAt).getTime();
  const graceEndMs = startMs + ATTENDANCE_GRACE_MINS * 60000;

  // Check if attendance was marked as late due to forgiveness or actual lateness
  const isLateAttendance = hasAttendance && shift.attendance?.status === 'late';

  // Check if it's currently late and no attendance has been recorded
  const isLateTime = !hasAttendance && now.getTime() > graceEndMs;

  if (hasAttendance) {
    return (
      <Box
        className={`bg-background-900 ${
          isLateAttendance ? 'border-warning-500' : 'border-success-500'
        } p-5 rounded-2xl border mb-4 shadow-xl`}
      >
        <Heading
          size="md"
          className={`mb-1 ${isLateAttendance ? 'text-warning-500' : 'text-success-500'}`}
        >
          {isLateAttendance ? t('attendance.lateTitle') : t('attendance.recordedTitle')}
        </Heading>
        <Text className="text-typography-300" size="sm">
          {isLateAttendance
            ? t('attendance.recordedLateAt', { date: format(new Date(shift.attendance!.recordedAt), 'PPpp') })
            : t('attendance.recordedAt', { date: format(new Date(shift.attendance!.recordedAt), 'PPpp') })}
        </Text>
      </Box>
    );
  }

  return (
    <Box
      className={`bg-background-900 ${
        isLateTime ? 'border-error-500' : 'border-white/10'
      } p-5 rounded-2xl border mb-4 shadow-xl`}
    >
      <VStack space="md">
        <Heading size="md" className="text-white font-bold">
          {isLateTime ? t('attendance.notRecordedTitle') : t('attendance.requiredTitle')}
        </Heading>

        {isLateTime ? (
          <Text className="text-error-400 font-bold" size="md">
            {t('attendance.lateMessage')}
          </Text>
        ) : (
          <Text className="text-typography-400">{t('attendance.requiredMessage')}</Text>
        )}

        {status ? (
          <Text size="sm" className="text-info-400 font-medium">
            {status}
          </Text>
        ) : null}

        {/* Custom Button Container to allow Gradient */}
        <Button
          size="lg"
          action={isLateTime ? 'negative' : 'primary'}
          onPress={handleRecordAttendance}
          isDisabled={attendanceMutation.isPending}
          className="p-0 overflow-hidden rounded-xl shadow-lg"
          style={{
            // @ts-ignore
            boxShadow: isLateTime ? '0 8px 25px rgba(220, 38, 38, 0.4)' : '0 8px 25px rgba(37, 99, 235, 0.4)',
          }}
        >
          <LinearGradient
            colors={isLateTime ? ['#DC2626', '#991B1B'] : ['#2563EB', '#1D4ED8']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={{
              width: '100%',
              height: '100%',
              justifyContent: 'center',
              alignItems: 'center',
              flexDirection: 'row',
            }}
          >
            {attendanceMutation.isPending ? <ButtonSpinner className="mr-2 text-white" /> : null}
            <ButtonText className="text-white font-bold uppercase tracking-[1px]">
              {isLateTime
                ? t('attendance.submitLateButton', { defaultValue: 'Record Late Attendance' })
                : t('attendance.submitButton')}
            </ButtonText>
          </LinearGradient>
        </Button>
      </VStack>
    </Box>
  );
}
