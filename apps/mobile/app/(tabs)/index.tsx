import React, { useEffect } from 'react';
import { ScrollView, RefreshControl, Alert } from 'react-native';
import { Box, VStack, Heading, Text, Spinner, Center } from '@gluestack-ui/themed';
import { useQuery } from '@tanstack/react-query';
import { client, setupInterceptors } from '../../src/api/client';
import AttendanceRecord from '../../src/components/AttendanceRecord';
import CheckInCard from '../../src/components/CheckInCard';
import ShiftCarousel from '../../src/components/ShiftCarousel';
import SessionMonitor from '../../src/components/SessionMonitor';
import { useTranslation } from 'react-i18next';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ShiftWithRelations, Guard } from '@repo/types';
import { CheckInWindowResult } from '@repo/shared';

type ActiveShiftData = {
  activeShift: (ShiftWithRelations & { checkInWindow?: CheckInWindowResult }) | null;
  nextShifts: ShiftWithRelations[];
};

type ProfileData = {
  guard: Guard;
};

export default function HomeScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  // Setup Global Logout Interceptor once
  useEffect(() => {
    setupInterceptors(() => {
      Alert.alert(t('dashboard.sessionExpiredTitle'), t('dashboard.sessionExpiredMessage'), [
        {
          text: 'OK',
          onPress: () => router.replace('/(auth)/login'),
        },
      ]);
    });
  }, [router, t]);

  const { data: profile } = useQuery<ProfileData>({
    queryKey: ['profile'],
    queryFn: async () => {
      const res = await client.get('/api/my/profile');
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
      const res = await client.get('/api/my/active-shift');
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
    <Box className="flex-1 bg-gray-50 relative">
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
          <Box className="mb-4">
            <Heading size="3xl" className="text-gray-900 leading-tight">
              {t('dashboard.welcome')}
              <Text className="text-blue-600">{profile?.guard?.name || 'Guard'}</Text>
            </Heading>
            {profile?.guard?.guardCode && (
              <Text className="text-gray-500 font-bold mt-1">
                {t('dashboard.guardCode')} {profile.guard.guardCode}
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
                <Box className="bg-white p-8 rounded-2xl border-2 border-dashed border-gray-300 items-center">
                  <Text className="text-gray-500 text-center font-medium">{t('dashboard.noActiveShift')}</Text>
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
