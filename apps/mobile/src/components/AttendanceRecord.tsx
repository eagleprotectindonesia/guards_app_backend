import React, { useState } from 'react';
import { Alert } from 'react-native';
import { Box, Button, ButtonText, Heading, Text, VStack, ButtonSpinner } from '@gluestack-ui/themed';
import * as Location from 'expo-location';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { client } from '../api/client';
import { useTranslation } from 'react-i18next';
import { ShiftWithRelations } from '@repo/types';

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
    setStatus(t('attendance.requestingPermission'));
    let { status: permStatus } = await Location.requestForegroundPermissionsAsync();

    if (permStatus !== 'granted') {
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
        className={`${isLateAttendance ? 'bg-yellow-50 border-yellow-200' : 'bg-white'} p-4 rounded-lg shadow-sm border border-gray-200 mb-4`}
      >
        <Heading size="md" className={`mb-2 ${isLateAttendance ? 'text-yellow-600' : 'text-green-600'}`}>
          {isLateAttendance ? t('attendance.lateTitle') : t('attendance.recordedTitle')}
        </Heading>
        <Text>
          {isLateAttendance
            ? t('attendance.recordedLateAt', { date: format(new Date(shift.attendance!.recordedAt), 'PPpp') })
            : t('attendance.recordedAt', { date: format(new Date(shift.attendance!.recordedAt), 'PPpp') })}
        </Text>
      </Box>
    );
  }

  return (
    <Box
      className={`${isLateTime ? 'bg-red-50 border-red-200' : 'bg-white'} p-4 rounded-lg shadow-sm border border-red-100 mb-4`}
    >
      <VStack space="md">
        <Heading size="md" className={isLateTime ? 'text-red-600' : 'text-gray-900'}>
          {isLateTime ? t('attendance.notRecordedTitle') : t('attendance.requiredTitle')}
        </Heading>

        {isLateTime ? (
          <Text className="text-red-600 font-medium italic">{t('attendance.lateMessage')}</Text>
        ) : (
          <Text className="text-gray-500">{t('attendance.requiredMessage')}</Text>
        )}

        {status ? <Text className="text-sm text-blue-600 font-medium">{status}</Text> : null}

        <Button
          size="lg"
          variant="solid"
          action={isLateTime ? 'negative' : 'primary'}
          onPress={handleRecordAttendance}
          isDisabled={attendanceMutation.isPending}
          className={isLateTime ? 'bg-red-600' : ''}
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
