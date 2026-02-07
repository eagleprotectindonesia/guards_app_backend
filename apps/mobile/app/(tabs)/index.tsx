import React from 'react';
import { ScrollView, RefreshControl } from 'react-native';
import { Box, VStack, Heading, Text, Spinner, Center } from '@gluestack-ui/themed';
import { useQuery } from '@tanstack/react-query';
import { client } from '../../src/api/client';
import AttendanceRecord from '../../src/components/AttendanceRecord';
import CheckInCard from '../../src/components/CheckInCard';
import ShiftCarousel from '../../src/components/ShiftCarousel';
import SessionMonitor from '../../src/components/SessionMonitor';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ShiftWithRelations, Employee } from '@repo/types';
import { CheckInWindowResult } from '@repo/shared';

type ActiveShiftData = {
  activeShift: (ShiftWithRelations & { checkInWindow?: CheckInWindowResult }) | null;
  nextShifts: ShiftWithRelations[];
};

type ProfileData = {
  employee: Employee;
};

export default function HomeScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();

  const { data: profile } = useQuery<ProfileData>({
    queryKey: ['profile'],
    queryFn: async () => {
      const res = await client.get('/api/employee/my/profile');
      return res.data;
    },
  });

  const {
    data: shiftData,
    isLoading,
    refetch,
    isRefetching,
  } = useQuery<ActiveShiftData>({
    queryKey: ['active-shift'],
    queryFn: async () => {
      const res = await client.get('/api/employee/my/active-shift');
      return res.data;
    },
    refetchInterval: 30000, // Poll every 30s
  });

  const activeShift = shiftData?.activeShift;
  const nextShifts = shiftData?.nextShifts || [];

  const isAttendanceLate = (() => {
    if (!activeShift || activeShift.attendance) return false;
    const ATTENDANCE_GRACE_MINS = 5;
    const startMs = new Date(activeShift.startsAt).getTime();
    const graceEndMs = startMs + ATTENDANCE_GRACE_MINS * 60000;
    return new Date().getTime() > graceEndMs;
  })();

  return (
    <Box flex={1} bg="$backgroundLight50" position="relative">
      <SessionMonitor />
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: 20,
          paddingBottom: 100,
          paddingTop: insets.top + 60, // Pushing down below status bar and language toggle
        }}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} />}
      >
        <VStack space="xl">
          <Box mb="$4">
            <Heading size="3xl" color="$textLight900" lineHeight="$tight">
              {t('dashboard.welcome')}
              <Text color="$blue600">{profile?.employee?.name || 'Employee'}</Text>
            </Heading>
            {profile?.employee?.employeeCode && (
              <Text color="$textLight500" fontWeight="$bold" mt="$1">
                {t('dashboard.employeeCode')} {profile.employee.employeeCode}
              </Text>
            )}
          </Box>

          {isLoading ? (
            <Center h={200}>
              <Spinner size="large" color="$blue600" />
            </Center>
          ) : (
            <VStack space="xl">
              {!activeShift && (
                <Box
                  bg="$white"
                  p="$8"
                  rounded="$2xl"
                  borderWidth={2}
                  borderStyle="dashed"
                  borderColor="$borderLight300"
                  alignItems="center"
                >
                  <Text color="$textLight500" textAlign="center" fontWeight="$medium">
                    {t('dashboard.noActiveShift')}
                  </Text>
                </Box>
              )}

              {(activeShift || nextShifts.length > 0) && (
                <ShiftCarousel activeShift={activeShift} nextShifts={nextShifts} />
              )}

              {activeShift && (
                <VStack space="md">
                  <AttendanceRecord shift={activeShift} onAttendanceRecorded={refetch} />

                  {/* Show CheckInCard if attendance is recorded OR late */}
                  {(activeShift.attendance || isAttendanceLate) && (
                    <CheckInCard activeShift={activeShift} refetchShift={refetch} />
                  )}
                </VStack>
              )}
            </VStack>
          )}
        </VStack>
      </ScrollView>
    </Box>
  );
}
