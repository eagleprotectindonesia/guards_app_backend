import React, { useEffect } from 'react';
import { ScrollView, RefreshControl, Image } from 'react-native';
import { Box } from '@/components/ui/box';
import { VStack } from '@/components/ui/vstack';
import { Heading } from '@/components/ui/heading';
import { Text } from '@/components/ui/text';
import { Spinner } from '@/components/ui/spinner';
import { Center } from '@/components/ui/center';
import { HStack } from '@/components/ui/hstack';
import { useQuery } from '@tanstack/react-query';
import { client } from '../../src/api/client';
import AttendanceRecord from '../../src/components/AttendanceRecord';
import CheckInCard from '../../src/components/CheckInCard';
import ShiftCarousel from '../../src/components/ShiftCarousel';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ShiftWithRelations } from '@repo/types';
import { CheckInWindowResult } from '@repo/shared';
import { startGeofencing, stopGeofencing, isGeofencingActive } from '../../src/utils/geofence';
import GlassLanguageToggle from '../../src/components/GlassLanguageToggle';
import { LinearGradient } from 'expo-linear-gradient';
import { useProfile } from '../../src/hooks/useProfile';
import { queryKeys } from '../../src/api/queryKeys';

type ActiveShiftData = {
  activeShift: (ShiftWithRelations & { checkInWindow?: CheckInWindowResult }) | null;
  nextShifts: ShiftWithRelations[];
};

export default function HomeScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();

  const { data: profile } = useProfile();

  const {
    data: shiftData,
    isLoading,
    refetch,
    isRefetching,
  } = useQuery<ActiveShiftData>({
    queryKey: queryKeys.shifts.active,
    queryFn: async () => {
      const res = await client.get('/api/employee/my/active-shift');
      return res.data;
    },
    refetchInterval: 30000, // Poll every 30s
  });

  const activeShift = shiftData?.activeShift;
  const nextShifts = shiftData?.nextShifts || [];

  // Re-sync geofencing lifecycle
  useEffect(() => {
    const syncGeofence = async () => {
      const isRunning = await isGeofencingActive();

      if (activeShift?.attendance) {
        if (!isRunning) {
          await startGeofencing(activeShift);
        }
      } else {
        // No active shift or no attendance yet - ensure geofencing is OFF
        if (isRunning) {
          console.log('[Geofence] No active shift with attendance, stopping...');
          await stopGeofencing();
        }
      }
    };
    syncGeofence();
  }, [activeShift]);

  const defaultAvatar =
    'https://lh3.googleusercontent.com/aida-public/AB6AXuDzcxM7B2Plj0M6rLwD5-jwCeXCJ-VxTGp8XT8dffCo7Cjv4BQ3_fM-MkOicyMU8jJxMw9Q81kjfqVm_zD_yfF92pmxUsZDY_fB7by9N3_LAOMNfdJlNjEUudjhqq7Cm5LUPTk9aKNVSgT9A4rsOYqHKU5vKRmjMZknp_AFtbKxzLh1PX2V_AKy5bez2tThvg_swnSuuvc4uRhd_JO8vfyGxuCUlrrS_Gt_LXaPHMHfgxPWTz6nvJqDPVw3QneYlTqVGg46xTuvrQDq';

  return (
    <Box className="flex-1 bg-background-950 relative">
      {/* Background Gradients to simulate the Deep Dark aesthetic */}
      <Box className="absolute top-0 left-0 right-0 h-[400px] opacity-30">
        <LinearGradient colors={['rgba(217, 35, 35, 0.1)', 'transparent']} style={{ flex: 1 }} />
      </Box>

      <ScrollView
        contentContainerStyle={{
          paddingBottom: 100,
          paddingTop: insets.top + 20,
        }}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor="#fff" />}
      >
        <VStack space="xl">
          {/* Header */}
          <Box className="px-6 mb-2">
            <HStack className="justify-between items-center w-full">
              <HStack space="md" className="items-center flex-1 mr-4 shrink">
                <Box className="w-12 h-12 rounded-full border border-white/10 overflow-hidden bg-background-900 shrink-0">
                  <Image source={{ uri: defaultAvatar }} style={{ width: '100%', height: '100%', opacity: 0.8 }} />
                </Box>
                <VStack className="flex-1 shrink">
                  <Text size="2xs" className="text-brand-500 font-bold uppercase tracking-[1.5px] mb-1 shrink">
                    {profile?.employee?.jobTitle || t('dashboard.unit')}
                  </Text>
                  <Heading size="lg" className="text-white font-bold shrink">
                    {profile?.employee?.fullName || ''}
                  </Heading>
                </VStack>
              </HStack>
              <Box className="shrink-0">
                <GlassLanguageToggle />
              </Box>
            </HStack>
          </Box>

          {isLoading ? (
            <Center className="h-[200px]">
              <Spinner size="large" className="text-brand-600" />
            </Center>
          ) : (
            <VStack space="xl">
              {/* Shift Carousel */}
              <Box>
                {activeShift || nextShifts.length > 0 ? (
                  <ShiftCarousel activeShift={activeShift} nextShifts={nextShifts} />
                ) : (
                  <Box className="px-6">
                    <Box className="bg-white/5 p-8 rounded-2xl border border-dashed border-white/10 items-center">
                      <Text className="text-typography-500 text-center font-medium">
                        {t('dashboard.noActiveShift')}
                      </Text>
                    </Box>
                  </Box>
                )}
              </Box>

              {/* Checkpoint Authentication / Attendance */}
              {activeShift && (
                <Box className="px-6">
                  <VStack space="md">
                    <CheckInCard activeShift={activeShift} refetchShift={refetch} />
                    <AttendanceRecord shift={activeShift} onAttendanceRecorded={refetch} />
                  </VStack>
                </Box>
              )}
            </VStack>
          )}
        </VStack>
      </ScrollView>
    </Box>
  );
}
