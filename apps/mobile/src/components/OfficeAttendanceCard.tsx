import React, { useState } from 'react';
import { format } from 'date-fns';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import * as Location from 'expo-location';
import { CalendarDays, CheckCircle2, Clock3, LogOut, MapPin } from 'lucide-react-native';
import { getEmployeeAttendanceCheckinErrorPayload } from '@repo/shared';
import { Office } from '@repo/types';
import { Box } from '@/components/ui/box';
import { Heading } from '@/components/ui/heading';
import { HStack } from '@/components/ui/hstack';
import { Pressable } from '@/components/ui/pressable';
import { Spinner } from '@/components/ui/spinner';
import { Text } from '@/components/ui/text';
import { VStack } from '@/components/ui/vstack';
import { useTranslation } from 'react-i18next';
import { useAlert } from '../contexts/AlertContext';
import { useAuth } from '../contexts/AuthContext';
import { useCustomToast } from '../hooks/useCustomToast';
import { useOfficeAttendance, useRecordOfficeAttendance } from '../hooks/useOfficeAttendance';
import { useProfile } from '../hooks/useProfile';
import {
  getOfficeHolidayDisplayContent,
  getOfficeScheduleDisplayState,
  resolveOfficeAttendanceErrorMessage,
} from './office-attendance-utils';

type Props = {
  office?: Office | null;
  enabled?: boolean;
};

export default function OfficeAttendanceCard({ office, enabled = true }: Props) {
  const { t } = useTranslation();
  const { showAlert } = useAlert();
  const { user } = useAuth();
  const toast = useCustomToast();
  const [statusMessage, setStatusMessage] = useState('');

  const { data, refetch, isRefetching } = useOfficeAttendance(enabled);
  const { data: profileData } = useProfile();
  const recordMutation = useRecordOfficeAttendance();

  const attendances = data?.attendances ?? [];
  const scheduleContext = data?.scheduleContext;
  const attendanceState = data?.attendanceState;
  const scheduleDisplay = getOfficeScheduleDisplayState(scheduleContext, attendanceState);
  const holidayDisplay = getOfficeHolidayDisplayContent(t, scheduleDisplay.holidayPolicy);

  console.log('[OfficeAttendanceCard] Render state', {
    hasScheduleContext: Boolean(scheduleContext),
    isWorkingDay: scheduleDisplay.isWorkingDay,
    businessDate: scheduleDisplay.businessDate,
    holidayPolicy: scheduleDisplay.holidayPolicy
      ? {
          entryId: scheduleDisplay.holidayPolicy.entry?.id,
          title: scheduleDisplay.holidayPolicy.entry?.title,
          type: scheduleDisplay.holidayPolicy.entry?.type,
          affectsAttendance: scheduleDisplay.holidayPolicy.entry?.affectsAttendance,
          marksAsWorkingDay: scheduleDisplay.holidayPolicy.marksAsWorkingDay,
        }
      : null,
    holidayDisplay,
  });

  const latestAttendance = scheduleDisplay.latestAttendance ?? attendances[0];

  const resolvedOffice = office ?? profileData?.employee.office ?? user?.office ?? latestAttendance?.office ?? null;
  const isClockedIn = scheduleDisplay.isClockedIn;
  const hasClockedOut = scheduleDisplay.isCompleted;
  const hasAssignedOffice = Boolean(resolvedOffice?.id);

  const requestLocation = async () => {
    const permission = await Location.requestForegroundPermissionsAsync();

    if (permission.status !== 'granted') {
      if (hasAssignedOffice) {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        toast.error(t('attendance.permissionDeniedTitle'), t('officeAttendance.errors.locationRequired'));
      }
      return null;
    }

    try {
      const current = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      return {
        lat: current.coords.latitude,
        lng: current.coords.longitude,
      };
    } catch {
      if (hasAssignedOffice) {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        toast.error(t('attendance.locationErrorTitle'), t('attendance.locationErrorMessage'));
      }
      return null;
    }
  };

  const handleRecordAttendance = async (nextStatus: 'present' | 'clocked_out') => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setStatusMessage(nextStatus === 'present' ? t('attendance.gettingLocation') : t('common.processing'));

    const location = await requestLocation();
    if (hasAssignedOffice && !location) {
      setStatusMessage(t('officeAttendance.errors.locationRequired'));
      return;
    }

    setStatusMessage(nextStatus === 'present' ? t('attendance.recording') : t('common.processing'));

    try {
      await recordMutation.mutateAsync({
        location: location ?? undefined,
        status: nextStatus,
      });

      const successMessage = nextStatus === 'present' ? t('attendance.success') : t('officeAttendance.clockOutSuccess');

      setStatusMessage(successMessage);
      toast.success(t('officeAttendance.title'), successMessage);
      refetch();
    } catch (error: unknown) {
      const errorData = getEmployeeAttendanceCheckinErrorPayload(error);
      const message = resolveOfficeAttendanceErrorMessage(t, {
        code: errorData.code,
        fallbackMessage: errorData.error || errorData.message || (error instanceof Error ? error.message : undefined),
        details: errorData.details,
      });

      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setStatusMessage(message);
      toast.error(t('officeAttendance.title'), message);
    }
  };

  const handleClockOutPress = () => {
    showAlert(
      t('officeAttendance.clockOutConfirmTitle'),
      t('officeAttendance.clockOutConfirmMessage'),
      [
        {
          text: t('common.cancel', 'Cancel'),
          style: 'cancel',
        },
        {
          text: t('officeAttendance.clockOutConfirmAction'),
          style: 'destructive',
          onPress: () => {
            void handleRecordAttendance('clocked_out');
          },
        },
      ],
      { icon: 'warning' }
    );
  };

  // if (isLoading && !data) {
  //   return (
  //     <Box className="bg-background-900 border border-white/10 rounded-[28px] p-6 mb-6 items-center">
  //       <Spinner className="text-brand-500" />
  //       <Text className="text-typography-400 mt-3">{t('common.loading')}</Text>
  //     </Box>
  //   );
  // }

  return (
    <Box className="rounded-[28px] overflow-hidden bg-background-900 border border-white/10 mb-6 shadow-xl">
      <Box className="relative overflow-hidden">
        <LinearGradient
          colors={['rgba(37, 99, 235, 0.18)', 'rgba(15, 23, 42, 0.02)']}
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
        />
        <Box className="p-6 border-b border-white/5">
          <HStack className="justify-between items-start">
            <VStack space="sm" className="flex-1 pr-4">
              <HStack space="sm" className="items-center">
                <Clock3 size={20} color="#60A5FA" />
                <Heading size="md" className="text-white">
                  {t('officeAttendance.title')}
                </Heading>
              </HStack>
              <HStack space="sm" className="items-center">
                <MapPin size={14} color="#94A3B8" />
                <Text size="sm" className="text-typography-400">
                  {resolvedOffice?.name || t('officeAttendance.noOfficeAssigned')}
                </Text>
              </HStack>
            </VStack>

            {scheduleDisplay.isWorkingDay ? (
              <Box className="bg-blue-500/15 px-3 py-1 rounded-full border border-blue-400/20">
                <Text size="2xs" className="text-blue-300 font-bold uppercase tracking-[1px]">
                  {t('officeAttendance.workingDay')}
                </Text>
              </Box>
            ) : null}
          </HStack>
        </Box>
      </Box>

      <Box className="p-6">
        {scheduleContext && scheduleDisplay.isWorkingDay ? (
          <Box className="bg-white/5 border border-white/10 rounded-2xl p-4 mb-5">
            <HStack space="sm" className="items-center mb-3">
              <CalendarDays size={16} color="#60A5FA" />
              <Text className="text-white font-semibold">
                {scheduleDisplay.scheduleName || t('officeAttendance.title')}
              </Text>
            </HStack>

            <HStack className="justify-between items-center mb-2">
              <Text size="sm" className="text-typography-500">
                {t('officeAttendance.dateLabel')}
              </Text>
              <Text size="sm" className="text-white">
                {scheduleDisplay.businessDate || '-'}
              </Text>
            </HStack>

            <HStack className="justify-between items-center">
              <Text size="sm" className="text-typography-500">
                {t('officeAttendance.windowLabel')}
              </Text>
              <Text size="sm" className="text-green-400 font-semibold">
                {scheduleDisplay.scheduledStartStr || '--:--'} - {scheduleDisplay.scheduledEndStr || '--:--'}
              </Text>
            </HStack>
          </Box>
        ) : scheduleContext ? (
          <Box className="bg-white/5 border border-white/10 rounded-2xl p-4 mb-5">
            <Text className="text-typography-400 text-center">{t('officeAttendance.nonWorkingDay')}</Text>
          </Box>
        ) : null}

        {holidayDisplay ? (
          <Box
            className={`rounded-2xl p-4 mb-5 border ${
              scheduleDisplay.holidayPolicy?.entry?.type === 'emergency'
                ? 'bg-warning-500/10 border-warning-500/20'
                : scheduleDisplay.holidayPolicy?.entry?.type === 'special_working_day'
                  ? 'bg-blue-500/10 border-blue-500/20'
                  : 'bg-success-500/10 border-success-500/20'
            }`}
          >
            <VStack space="xs">
              <HStack className="justify-between items-center">
                <Text size="xs" className="text-typography-400 uppercase tracking-[1.2px] font-bold">
                  {holidayDisplay.headline}
                </Text>
                <Text size="2xs" className="text-typography-400">
                  {holidayDisplay.typeLabel}
                </Text>
              </HStack>
              <Text className="text-white font-semibold">{holidayDisplay.title}</Text>
              <Text
                size="sm"
                className={
                  scheduleDisplay.holidayPolicy?.entry?.type === 'emergency'
                    ? 'text-warning-200'
                    : scheduleDisplay.holidayPolicy?.entry?.type === 'special_working_day'
                      ? 'text-blue-200'
                      : 'text-success-200'
                }
              >
                {holidayDisplay.impact}
              </Text>
              <HStack className="justify-between items-center">
                <Text size="sm" className="text-typography-400">
                  {t('officeAttendance.dateLabel')}
                </Text>
                <Text size="sm" className="text-white">
                  {scheduleDisplay.businessDate || '-'}
                </Text>
              </HStack>
              <HStack className="justify-between items-center">
                <Text size="sm" className="text-typography-400">
                  {t('officeAttendance.holiday.compensation')}
                </Text>
                <Text size="sm" className="text-white">
                  {holidayDisplay.paidStatus}
                </Text>
              </HStack>
            </VStack>
          </Box>
        ) : null}

        {isClockedIn ? (
          <VStack space="md">
            <Box className="bg-success-500/10 border border-success-500/20 rounded-2xl p-4">
              <HStack space="md" className="items-center">
                <CheckCircle2 size={22} color="#4ADE80" />
                <VStack>
                  <Text size="sm" className="text-typography-400">
                    {t('officeAttendance.clockedIn')}
                  </Text>
                  <Text size="xl" className="text-success-300 font-bold">
                    {latestAttendance ? format(new Date(latestAttendance.recordedAt), 'HH:mm:ss') : '--:--:--'}
                  </Text>
                </VStack>
              </HStack>
            </Box>

            <Pressable onPress={handleClockOutPress} disabled={recordMutation.isPending}>
              {({ pressed }: { pressed: boolean }) => (
                <LinearGradient
                  colors={['#DC2626', '#991B1B']}
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
                    {recordMutation.isPending ? <Spinner className="text-white" /> : <LogOut size={18} color="white" />}
                    <Text className="text-white font-bold uppercase tracking-[1px]">
                      {t('officeAttendance.clockOut')}
                    </Text>
                  </HStack>
                </LinearGradient>
              )}
            </Pressable>
          </VStack>
        ) : hasClockedOut ? (
          <Box className="bg-white/5 border border-white/10 rounded-2xl p-4">
            <HStack space="md" className="items-center">
              <CheckCircle2 size={22} color="#94A3B8" />
              <VStack>
                <Text size="sm" className="text-typography-400">
                  {t('officeAttendance.dayCompleted')}
                </Text>
                <Text size="sm" className="text-typography-500">
                  {t('officeAttendance.clockOutTime')}{' '}
                  {latestAttendance ? format(new Date(latestAttendance.recordedAt), 'HH:mm') : '--:--'}
                </Text>
              </VStack>
            </HStack>
          </Box>
        ) : scheduleDisplay.isMissed ? (
          <Box className="bg-warning-500/10 border border-warning-500/20 rounded-2xl p-4">
            <HStack space="md" className="items-center">
              <Clock3 size={22} color="#FBBF24" />
              <VStack className="flex-1">
                <Text size="sm" className="text-warning-300 font-semibold">
                  {t('officeAttendance.missedTitle')}
                </Text>
                <Text size="sm" className="text-warning-100">
                  {t('officeAttendance.missedMessage')}
                </Text>
              </VStack>
            </HStack>
          </Box>
        ) : (
          <VStack space="sm">
            <Pressable
              onPress={scheduleDisplay.canClockIn ? () => handleRecordAttendance('present') : undefined}
              disabled={!scheduleDisplay.canClockIn || recordMutation.isPending}
            >
              {({ pressed }: { pressed: boolean }) => (
                <LinearGradient
                  colors={scheduleDisplay.canClockIn ? ['#2563EB', '#1D4ED8'] : ['#334155', '#1E293B']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={{
                    borderRadius: 16,
                    paddingVertical: 16,
                    opacity: pressed ? 0.92 : 1,
                    transform: [{ scale: pressed ? 0.985 : 1 }],
                  }}
                >
                  <HStack space="sm" className="justify-center items-center">
                    {recordMutation.isPending ? <Spinner className="text-white" /> : <Clock3 size={18} color="white" />}
                    <Text className="text-white font-bold uppercase tracking-[1px]">
                      {t('officeAttendance.clockIn')}
                    </Text>
                  </HStack>
                </LinearGradient>
              )}
            </Pressable>

            {!scheduleDisplay.isWorkingDay ? (
              <Text size="sm" className="text-typography-500 text-center">
                {t('officeAttendance.cannotClockInNonWorkingDay')}
              </Text>
            ) : null}
            {scheduleDisplay.isAfterEnd && !scheduleDisplay.canClockIn ? (
              <Text size="sm" className="text-warning-300 text-center">
                {t('officeAttendance.missedMessage')}
              </Text>
            ) : null}
          </VStack>
        )}

        {statusMessage ? (
          <Text size="sm" className="text-info-400 text-center mt-4">
            {statusMessage}
          </Text>
        ) : null}

        {isRefetching ? (
          <Text size="xs" className="text-typography-500 text-center mt-3">
            {t('common.loading')}
          </Text>
        ) : null}

        {attendances.length > 0 ? (
          <VStack space="sm" className="mt-6 pt-5 border-t border-white/10">
            <Text size="xs" className="text-typography-500 uppercase tracking-[1.5px] font-bold">
              {t('officeAttendance.history')}
            </Text>

            {attendances
              .slice()
              .reverse()
              .map(attendance => (
                <HStack
                  key={attendance.id}
                  className="justify-between items-center bg-white/5 border border-white/5 rounded-xl px-4 py-3"
                >
                  <HStack space="sm" className="items-center">
                    <Box
                      className={`w-2.5 h-2.5 rounded-full ${
                        attendance.status === 'present' ? 'bg-success-500' : 'bg-error-500'
                      }`}
                    />
                    <Text className="text-white">
                      {attendance.status === 'present' ? t('officeAttendance.in') : t('officeAttendance.out')}
                    </Text>
                  </HStack>

                  <Text className="text-typography-400 font-medium">
                    {format(new Date(attendance.recordedAt), 'HH:mm:ss')}
                  </Text>
                </HStack>
              ))}
          </VStack>
        ) : null}
      </Box>
    </Box>
  );
}
