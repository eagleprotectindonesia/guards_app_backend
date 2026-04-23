import React, { useRef, useState } from 'react';
import { ScrollView, Dimensions, NativeScrollEvent, NativeSyntheticEvent } from 'react-native';
import { format } from 'date-fns';
import { id, enUS } from 'date-fns/locale';
import { CalendarDays, Clock } from 'lucide-react-native';
import { Box } from '@/components/ui/box';
import { VStack } from '@/components/ui/vstack';
import { HStack } from '@/components/ui/hstack';
import { Text } from '@/components/ui/text';
import { useTranslation } from 'react-i18next';
import type { OfficeAttendanceDaySummary } from '../hooks/useOfficeAttendance';
import { parseOfficeAttendanceDayDate, resolveOfficeAttendanceIsToday } from './office-attendance-carousel-date';
import { getOfficeHolidayDisplayContent } from './office-attendance-utils';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_WIDTH = SCREEN_WIDTH - 36; // Full width minus padding (24 * 2)

interface OfficeAttendanceCarouselProps {
  weeklyDays: OfficeAttendanceDaySummary[];
  isLoading?: boolean;
}

export default function OfficeAttendanceCarousel({ weeklyDays, isLoading }: OfficeAttendanceCarouselProps) {
  const { t, i18n } = useTranslation();
  const scrollViewRef = useRef<ScrollView>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const dateLocale = i18n.language === 'id' ? id : enUS;

  const handleScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const scrollPosition = event.nativeEvent.contentOffset.x;
    const index = Math.round(scrollPosition / (CARD_WIDTH + 16));
    if (index !== activeIndex) {
      setActiveIndex(index);
    }
  };

  if (isLoading || weeklyDays.length === 0) {
    return null;
  }

  const firstDayDateKey = weeklyDays[0]?.dateKey;

  const renderDayCard = (day: OfficeAttendanceDaySummary, index: number) => {
    const date = parseOfficeAttendanceDayDate(day.dateKey, day.date);
    const isToday = resolveOfficeAttendanceIsToday({
      dayDateKey: day.dateKey,
      firstDayDateKey,
      index,
    });
    const hasAttendance = day.attendances.length > 0;
    const holidayDisplay = getOfficeHolidayDisplayContent(t, day.holidayPolicy);
    const holidayType = day.holidayPolicy?.entry?.type;

    console.log('[OfficeAttendanceCarousel] Day render', {
      date: day.date,
      dateKey: day.dateKey,
      isWorkingDay: day.isWorkingDay,
      holidayPolicy: day.holidayPolicy
        ? {
            entryId: day.holidayPolicy.entry.id,
            title: day.holidayPolicy.entry.title,
            type: day.holidayPolicy.entry.type,
            affectsAttendance: day.holidayPolicy.entry.affectsAttendance,
            marksAsWorkingDay: day.holidayPolicy.marksAsWorkingDay,
          }
        : null,
      holidayDisplay,
    });

    return (
      <Box
        key={day.date}
        className="rounded-[32px] overflow-hidden bg-background-900 border border-outline-800"
        style={{ width: CARD_WIDTH, marginRight: index < weeklyDays.length - 1 ? 28 : 0 }}
      >
        {/* Left Border Gradient Effect */}
        <Box className="absolute left-0 top-0 bottom-0 w-[2px] bg-blue-600 opacity-50" />

        <Box className="p-6">
          {/* Header */}
          <HStack className="justify-between items-center mb-6">
            <HStack space="md" className="items-center">
              <Box className="w-8 h-8 rounded-xl bg-background-800 items-center justify-center border border-outline-700">
                <CalendarDays size={16} color="#3B82F6" />
              </Box>
              <VStack>
                <Text size="sm" className="text-white font-medium">
                  {isToday ? t('common.today', 'Today') : format(date, 'EEEE', { locale: dateLocale })}
                </Text>
                <Text size="xs" className="text-typography-500">
                  {format(date, 'dd MMMM yyyy', { locale: dateLocale })}
                </Text>
              </VStack>
            </HStack>
            {day.isWorkingDay && (
              <Box className="bg-blue-500/15 border border-blue-400/30 px-3 py-1.5 rounded-full">
                <Text size="xs" className="text-blue-400 font-extrabold uppercase tracking-[2px]">
                  {isToday ? t('officeAttendance.workingDay') : t('shift.upcomingStatus')}
                </Text>
              </Box>
            )}
          </HStack>

          {/* Details */}
          {day.isWorkingDay ? (
            <VStack space="md">
              {holidayDisplay ? (
                <Box
                  className={`rounded-2xl p-4 border ${
                    holidayType === 'emergency'
                      ? 'bg-warning-500/10 border-warning-500/20'
                      : holidayType === 'special_working_day'
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
                    <Text size="sm" className="text-white font-semibold">
                      {holidayDisplay.title}
                    </Text>
                    <Text
                      size="sm"
                      className={
                        holidayType === 'emergency'
                          ? 'text-warning-200'
                          : holidayType === 'special_working_day'
                            ? 'text-blue-200'
                            : 'text-success-200'
                      }
                    >
                      {holidayDisplay.impact}
                    </Text>
                    <HStack className="justify-between items-center pt-1">
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

              <HStack space="md" className="items-center">
                <Box className="flex-1">
                  <Text size="xs" className="text-typography-500 uppercase tracking-[1.5px] mb-1.5 font-semibold">
                    {t('officeAttendance.windowLabel')}
                  </Text>
                  <HStack space="xs" className="items-center">
                    <Clock size={14} color="#3B82F6" />
                    <Text size="md" className="text-white font-medium">
                      {day.scheduledStartStr || '--:--'} — {day.scheduledEndStr || '--:--'}
                    </Text>
                  </HStack>
                </Box>
              </HStack>

              <Box className="h-[1px] w-full bg-white opacity-10" />

              {hasAttendance ? (
                <VStack space="sm">
                  <Text size="xs" className="text-typography-500 uppercase tracking-[1.5px] font-bold">
                    {t('officeAttendance.history')}
                  </Text>
                  {day.attendances.map(attendance => (
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
                        {format(new Date(attendance.recordedAt), 'HH:mm')}
                      </Text>
                    </HStack>
                  ))}
                </VStack>
              ) : (
                <HStack className="justify-between items-center">
                  <HStack space="sm" className="items-center">
                    <Box className="w-2 h-2 relative items-center justify-center">
                      <Box className="absolute w-2 h-2 rounded-full bg-success-400 opacity-75" />
                      <Box className="w-2 h-2 rounded-full bg-success-500" />
                    </Box>
                    <Text size="sm" className="text-typography-400 font-medium">
                      {t('officeAttendance.noAttendance')}
                    </Text>
                  </HStack>
                </HStack>
              )}
            </VStack>
          ) : (
            <VStack space="md" className="py-4">
              {holidayDisplay ? (
                <Box
                  className={`rounded-2xl p-4 border ${
                    holidayType === 'emergency'
                      ? 'bg-warning-500/10 border-warning-500/20'
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
                    <Text size="sm" className="text-white font-semibold">
                      {holidayDisplay.title}
                    </Text>
                    <Text size="sm" className={holidayType === 'emergency' ? 'text-warning-200' : 'text-success-200'}>
                      {holidayDisplay.impact}
                    </Text>
                    {/* <HStack className="justify-between items-center pt-1">
                      <Text size="sm" className="text-typography-400">
                        {t('officeAttendance.holiday.compensation')}
                      </Text>
                      <Text size="sm" className="text-white">
                        {holidayDisplay.paidStatus}
                      </Text>
                    </HStack> */}
                  </VStack>
                </Box>
              ) : null}

              {!holidayDisplay ? (
                <Box>
                  <Text className="text-typography-400 text-center">{t('officeAttendance.nonWorkingDay')}</Text>
                </Box>
              ) : null}
            </VStack>
          )}
        </Box>
      </Box>
    );
  };

  return (
    <Box>
      <ScrollView
        ref={scrollViewRef}
        horizontal
        pagingEnabled={false}
        showsHorizontalScrollIndicator={false}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        decelerationRate="fast"
        snapToOffsets={Array.from({ length: weeklyDays.length }).map((_, i) => i * (CARD_WIDTH + 32))}
        snapToAlignment="center"
        disableIntervalMomentum={true}
        contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 16 }}
      >
        {weeklyDays.map((day, index) => renderDayCard(day, index))}
      </ScrollView>

      {weeklyDays.length > 1 && (
        <HStack space="xs" className="justify-center mt-2 mb-4">
          {Array.from({ length: weeklyDays.length }).map((_, i) => (
            <Box
              key={i}
              className={`w-1.5 h-1.5 rounded-full ${i === activeIndex ? 'bg-blue-500' : 'bg-white/10'}`}
              style={{
                // @ts-ignore
                boxShadow: i === activeIndex ? '0 0 8px rgba(59, 130, 246, 0.4)' : 'none',
              }}
            />
          ))}
        </HStack>
      )}
    </Box>
  );
}
