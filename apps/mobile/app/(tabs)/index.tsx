import React, { useState } from 'react';
import { ScrollView, RefreshControl, Image } from 'react-native';
import { Box } from '@/components/ui/box';
import { VStack } from '@/components/ui/vstack';
import { Heading } from '@/components/ui/heading';
import { Text } from '@/components/ui/text';
import { Spinner } from '@/components/ui/spinner';
import { Center } from '@/components/ui/center';
import { HStack } from '@/components/ui/hstack';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { client } from '../../src/api/client';
import AttendanceRecord from '../../src/components/AttendanceRecord';
import CheckInCard from '../../src/components/CheckInCard';
import OfficeAttendanceCard from '../../src/components/OfficeAttendanceCard';
import ShiftCarousel from '../../src/components/ShiftCarousel';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ShiftWithRelations } from '@repo/types';
import { CheckInWindowResult } from '@repo/shared';
import GlassLanguageToggle from '../../src/components/GlassLanguageToggle';
import { LinearGradient } from 'expo-linear-gradient';
import { useProfile } from '../../src/hooks/useProfile';
import { queryKeys } from '../../src/api/queryKeys';
import { usePasswordChangeModal } from '../../src/contexts/PasswordChangeModalContext';

type ActiveShiftData = {
  activeShift: (ShiftWithRelations & { checkInWindow?: CheckInWindowResult }) | null;
  nextShifts: ShiftWithRelations[];
};

export default function HomeScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const [isManualRefreshing, setIsManualRefreshing] = useState(false);
  const { isOpen: isPasswordChangeModalOpen } = usePasswordChangeModal();

  const { data: profile, isLoading: isProfileLoading } = useProfile();
  const employeeRole = profile?.employee?.role;
  const isOfficeEmployee = employeeRole === 'office';
  const isOnSiteEmployee = employeeRole === 'on_site';

  const {
    data: shiftData,
    isLoading: isShiftLoading,
    refetch,
    isRefetching,
  } = useQuery<ActiveShiftData>({
    queryKey: queryKeys.shifts.active,
    enabled: isOnSiteEmployee,
    queryFn: async () => {
      const res = await client.get('/api/employee/my/active-shift');
      return res.data;
    },
    refetchInterval: 30000,
  });

  const activeShift = shiftData?.activeShift;
  const nextShifts = shiftData?.nextShifts || [];
  const isLoading = isProfileLoading || (isOnSiteEmployee && isShiftLoading);

  const defaultAvatar =
    'https://lh3.googleusercontent.com/aida-public/AB6AXuDzcxM7B2Plj0M6rLwD5-jwCeXCJ-VxTGp8XT8dffCo7Cjv4BQ3_fM-MkOicyMU8jJxMw9Q81kjfqVm_zD_yfF92pmxUsZDY_fB7by9N3_LAOMNfdJlNjEUudjhqq7Cm5LUPTk9aKNVSgT9A4rsOYqHKU5vKRmjMZknp_AFtbKxzLh1PX2V_AKy5bez2tThvg_swnSuuvc4uRhd_JO8vfyGxuCUlrrS_Gt_LXaPHMHfgxPWTz6nvJqDPVw3QneYlTqVGg46xTuvrQDq';

  const handleRefresh = async () => {
    setIsManualRefreshing(true);
    try {
      await queryClient.invalidateQueries({ queryKey: queryKeys.profile });

      if (isOfficeEmployee) {
        if (isPasswordChangeModalOpen) {
          return;
        }
        await queryClient.invalidateQueries({ queryKey: queryKeys.officeAttendance.today });
        return;
      }

      await refetch();
    } finally {
      setIsManualRefreshing(false);
    }
  };

  return (
    <Box className="flex-1 bg-background-950 relative">
      <Box className="absolute top-0 left-0 right-0 h-[400px] opacity-30">
        <LinearGradient colors={['rgba(217, 35, 35, 0.1)', 'transparent']} style={{ flex: 1 }} />
      </Box>

      <ScrollView
        contentContainerStyle={{
          paddingBottom: 100,
          paddingTop: insets.top + 20,
        }}
        refreshControl={
          <RefreshControl
            refreshing={isManualRefreshing || Boolean(isRefetching && isOnSiteEmployee)}
            onRefresh={handleRefresh}
            tintColor="#fff"
          />
        }
      >
        <VStack space="xl">
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
          ) : isOfficeEmployee ? (
            <Box className="px-6">
              {!isPasswordChangeModalOpen ? <OfficeAttendanceCard office={profile?.employee?.office} /> : null}
            </Box>
          ) : (
            <VStack space="xl">
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

              {activeShift ? (
                <Box className="px-6">
                  <VStack space="md">
                    <CheckInCard activeShift={activeShift} refetchShift={refetch} />
                    <AttendanceRecord shift={activeShift} onAttendanceRecorded={refetch} />
                  </VStack>
                </Box>
              ) : null}
            </VStack>
          )}
        </VStack>
      </ScrollView>
    </Box>
  );
}
