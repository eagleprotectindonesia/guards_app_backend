import React, { useEffect } from 'react';
import { ScrollView, RefreshControl, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { format } from 'date-fns';
import { id, enUS } from 'date-fns/locale';
import { ChevronLeft, Bell, CalendarDays } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Box } from '@/components/ui/box';
import { VStack } from '@/components/ui/vstack';
import { HStack } from '@/components/ui/hstack';
import { Heading } from '@/components/ui/heading';
import { Text } from '@/components/ui/text';
import { Center } from '@/components/ui/center';
import { Spinner } from '@/components/ui/spinner';
import { useAnnouncements } from '../../src/hooks/useAnnouncements';

const PRIMARY_ORANGE = '#F97316';

export default function AnnouncementsScreen() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { announcements, unreadCount, isLoading, refetch, isRefetching, markCurrentAsSeen } = useAnnouncements();

  const dateLocale = i18n.language === 'id' ? id : enUS;

  useEffect(() => {
    if (unreadCount > 0) {
      void markCurrentAsSeen();
    }
  }, [markCurrentAsSeen, unreadCount]);

  return (
    <Box className="flex-1 bg-black">
      <Box className="absolute top-0 left-0 right-0 h-[300px] opacity-20">
        <LinearGradient colors={['rgba(249, 115, 22, 0.2)', 'transparent']} style={{ flex: 1 }} />
      </Box>

      <Box style={{ paddingTop: insets.top + 10 }} className="px-6 pb-4 flex-row items-center justify-between">
        <HStack space="md" className="items-center">
          <TouchableOpacity
            onPress={() => router.back()}
            className="w-10 h-10 rounded-full bg-white/5 items-center justify-center border border-white/10"
          >
            <ChevronLeft size={24} color="white" />
          </TouchableOpacity>
          <Heading size="xl" className="text-white font-bold">
            {t('announcements.title', 'Announcements')}
          </Heading>
        </HStack>
      </Box>

      <ScrollView
        contentContainerStyle={{ paddingBottom: 40, paddingHorizontal: 20 }}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={PRIMARY_ORANGE} />}
      >
        {isLoading ? (
          <Center className="py-20">
            <Spinner size="large" className="text-brand-500" />
          </Center>
        ) : announcements.length === 0 ? (
          <Center className="py-20 px-10">
            <Box style={styles.emptyCard}>
              <Box className="w-20 h-20 rounded-full bg-white/5 items-center justify-center mb-4 border border-white/5">
                <Bell size={40} color="#333" />
              </Box>
              <Text className="text-center text-[#666] font-medium">{t('announcements.empty', 'No announcements')}</Text>
            </Box>
          </Center>
        ) : (
          <VStack space="md" className="mt-4">
            {announcements.map(item => (
              <Box key={item.id} style={styles.card}>
                <VStack space="sm">
                  <HStack className="items-center justify-between">
                    <Text className="text-[#F97316] font-bold uppercase tracking-[1.2px]" size="2xs">
                      {item.kind === 'holiday'
                        ? t('announcements.kindHoliday', 'Holiday')
                        : t('announcements.kindOfficeMemo', 'Office Memo')}
                    </Text>
                    <HStack space="xs" className="items-center">
                      <CalendarDays size={14} color="#9CA3AF" />
                      <Text className="text-[#9CA3AF]" size="2xs">
                        {format(new Date(item.startsAt), 'dd MMM yyyy', { locale: dateLocale })}
                      </Text>
                    </HStack>
                  </HStack>

                  <Text className="text-white font-bold" size="md">
                    {item.title}
                  </Text>

                  <Text className="text-[#D1D1D1] opacity-90" size="sm">
                    {item.message?.trim() ||
                      (item.kind === 'holiday'
                        ? t('announcements.holidaySummary', 'Upcoming holiday. Check attendance policy for this date.')
                        : t('announcements.officeMemoSummary', 'Office memo update. Please review the details.'))}
                  </Text>

                  <HStack className="justify-between items-center pt-1">
                    <Text className="text-[#666] uppercase tracking-[1px]" size="2xs">
                      {t('announcements.period', 'Period')}
                    </Text>
                    <Text className="text-[#A0A0A0]" size="2xs">
                      {format(new Date(item.startsAt), 'dd MMM', { locale: dateLocale })} -{' '}
                      {format(new Date(item.endsAt), 'dd MMM yyyy', { locale: dateLocale })}
                    </Text>
                  </HStack>
                </VStack>
              </Box>
            ))}
          </VStack>
        )}
      </ScrollView>
    </Box>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: 'rgba(18, 18, 18, 0.9)',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
    padding: 16,
  },
  emptyCard: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
    backgroundColor: 'rgba(18, 18, 18, 0.85)',
    padding: 28,
    alignItems: 'center',
    width: '100%',
  },
});
