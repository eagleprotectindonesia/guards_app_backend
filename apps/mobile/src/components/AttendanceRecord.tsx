import React, { useState } from 'react';
import { useCustomToast } from '../hooks/useCustomToast';
import { Box, Button, ButtonText, Heading, Text, VStack, ButtonSpinner } from '@gluestack-ui/themed';
import * as Location from 'expo-location';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { client } from '../api/client';
import { useTranslation } from 'react-i18next';
import { ShiftWithRelations } from '@repo/types';
import * as Haptics from 'expo-haptics';
import { startGeofencing } from '../utils/geofence';
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
      await startGeofencing(shift);
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
        bg="$backgroundDark900"
        borderColor={isLateAttendance ? '$amber500' : '$green500'}
        p="$5"
        rounded="$2xl"
        borderWidth={1}
        mb="$4"
        sx={{
          _web: {
            boxShadow: isLateAttendance ? '0 0 15px rgba(245, 158, 11, 0.15)' : '0 0 15px rgba(16, 185, 129, 0.15)',
          },
        }}
      >
        <Heading size="md" mb="$1" color={isLateAttendance ? '$amber500' : '$green500'}>
          {isLateAttendance ? t('attendance.lateTitle') : t('attendance.recordedTitle')}
        </Heading>
        <Text color="$textDark300" size="sm">
          {isLateAttendance
            ? t('attendance.recordedLateAt', { date: format(new Date(shift.attendance!.recordedAt), 'PPpp') })
            : t('attendance.recordedAt', { date: format(new Date(shift.attendance!.recordedAt), 'PPpp') })}
        </Text>
      </Box>
    );
  }

  return (
    <Box
      bg="$backgroundDark900"
      borderColor={isLateTime ? '$red500' : 'rgba(255,255,255,0.1)'}
      p="$5"
      rounded="$2xl"
      borderWidth={1}
      mb="$4"
      sx={{
        _web: {
          boxShadow: isLateTime ? '0 0 20px rgba(239, 68, 68, 0.15)' : '0 10px 30px -10px rgba(0,0,0,0.5)',
        },
      }}
    >
      <VStack space="md">
        <Heading size="md" color="$white" fontWeight="$bold">
          {isLateTime ? t('attendance.notRecordedTitle') : t('attendance.requiredTitle')}
        </Heading>

        {isLateTime ? (
          <Text color="$red400" fontWeight="$bold" size="md">
            {t('attendance.lateMessage')}
          </Text>
        ) : (
          <Text color="$textDark400">{t('attendance.requiredMessage')}</Text>
        )}

        {status ? (
          <Text size="sm" color="$blue400" fontWeight="$medium">
            {status}
          </Text>
        ) : null}

        {/* Custom Button Container to allow Gradient */}
        <Button
          size="lg"
          variant="solid"
          action={isLateTime ? 'negative' : 'primary'}
          onPress={handleRecordAttendance}
          isDisabled={attendanceMutation.isPending}
          p="$0" // Remove padding to let gradient fill
          overflow="hidden"
          rounded="$xl"
          sx={{
            _web: {
              background: 'transparent',
              boxShadow: isLateTime ? '0 8px 25px rgba(220, 38, 38, 0.4)' : '0 8px 25px rgba(37, 99, 235, 0.4)',
            },
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
            {attendanceMutation.isPending ? <ButtonSpinner mr="$2" color="$white" /> : null}
            <ButtonText color="$white" fontWeight="$bold" textTransform="uppercase" letterSpacing={1}>
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
