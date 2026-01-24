import React, { useState } from 'react';
import { Alert } from 'react-native';
import { Box, Button, ButtonText, Heading, Text, VStack, ButtonSpinner } from '@gluestack-ui/themed';
import * as Location from 'expo-location';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { client } from '../api/client';
import { useTranslation } from 'react-i18next';
import { ShiftWithRelations } from '@repo/types';
import * as Haptics from 'expo-haptics';

type AttendanceRecordProps = {
  shift: ShiftWithRelations;
  onAttendanceRecorded?: () => void;
};

export default function AttendanceRecord({ shift, onAttendanceRecorded }: AttendanceRecordProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<string>('');

  const attendanceMutation = useMutation({
    mutationFn: async (location: { lat: number; lng: number }) => {
      const response = await client.post(`/api/employee/shifts/${shift.id}/attendance`, {
        shiftId: shift.id,
        location,
      });
      return response.data;
    },
    onSuccess: () => {
      setStatus(t('attendance.success'));
      queryClient.invalidateQueries({ queryKey: ['active-shift'] });
      if (onAttendanceRecorded) onAttendanceRecorded();
    },
    onError: (error: any) => {
      const msg = error.response?.data?.error || error.message || t('attendance.fail');
      setStatus(t('attendance.failPrefix') + msg);
      Alert.alert('Error', msg);
    },
  });

  const handleRecordAttendance = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setStatus(t('attendance.requestingPermission'));
    let { status: permStatus } = await Location.requestForegroundPermissionsAsync();

    if (permStatus !== 'granted') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setStatus(t('attendance.permissionDenied'));
      Alert.alert(t('attendance.permissionDeniedTitle'), t('attendance.locationRequired'));
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
      Alert.alert(t('attendance.locationErrorTitle'), t('attendance.locationErrorMessage'));
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
        bg={isLateAttendance ? '$amber50' : '$green50'}
        borderColor={isLateAttendance ? '$amber300' : '$green300'}
        p="$5"
        rounded="$2xl"
        borderWidth={2}
        mb="$4"
        sx={{
          _shadow: {
            shadowColor: isLateAttendance ? '#F59E0B' : '#10B981',
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.15,
            shadowRadius: 8,
            elevation: 3,
          }
        }}
      >
        <Heading size="md" mb="$2" color={isLateAttendance ? '$amber700' : '$green700'}>
          {isLateAttendance ? t('attendance.lateTitle') : t('attendance.recordedTitle')}
        </Heading>
        <Text color={isLateAttendance ? '$amber600' : '$green600'}>
          {isLateAttendance
            ? t('attendance.recordedLateAt', { date: format(new Date(shift.attendance!.recordedAt), 'PPpp') })
            : t('attendance.recordedAt', { date: format(new Date(shift.attendance!.recordedAt), 'PPpp') })}
        </Text>
      </Box>
    );
  }

  return (
    <Box
      bg={isLateTime ? '$red50' : '$white'}
      borderColor={isLateTime ? '$red300' : '$borderLight300'}
      p="$5"
      rounded="$2xl"
      borderWidth={2}
      mb="$4"
      sx={{
        _shadow: {
          shadowColor: isLateTime ? '#EF4444' : '#3B82F6',
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.15,
          shadowRadius: 8,
          elevation: 3,
        }
      }}
    >
      <VStack space="md">
        <Heading size="md" color={isLateTime ? '$red700' : '$textLight900'} fontWeight="$bold">
          {isLateTime ? t('attendance.notRecordedTitle') : t('attendance.requiredTitle')}
        </Heading>

        {isLateTime ? (
          <Text color="$red700" fontWeight="$bold" size="md">{t('attendance.lateMessage')}</Text>
        ) : (
          <Text color="$textLight600">{t('attendance.requiredMessage')}</Text>
        )}

        {status ? <Text size="sm" color="$blue600" fontWeight="$medium">{status}</Text> : null}

        <Button
          size="lg"
          variant="solid"
          action={isLateTime ? 'negative' : 'primary'}
          onPress={handleRecordAttendance}
          isDisabled={attendanceMutation.isPending}
          bg={isLateTime ? '$red600' : '$primary600'}
          sx={{
            _shadow: {
              shadowColor: isLateTime ? '#DC2626' : '#2563EB',
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.3,
              shadowRadius: 8,
            }
          }}
        >
          {attendanceMutation.isPending ? <ButtonSpinner mr="$2" color="white" /> : null}
          <ButtonText>
            {isLateTime
              ? t('attendance.submitLateButton', { defaultValue: 'Record Late Attendance' })
              : t('attendance.submitButton')}
          </ButtonText>
        </Button>
      </VStack>
    </Box>
  );
}
