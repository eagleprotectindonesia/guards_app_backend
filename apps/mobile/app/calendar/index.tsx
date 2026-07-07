import { useState, useMemo, useCallback } from 'react';
import { ScrollView } from 'react-native';
import { Box } from '@/components/ui/box';
import { VStack } from '@/components/ui/vstack';
import { HStack } from '@/components/ui/hstack';
import { Text } from '@/components/ui/text';
import { Pressable } from '@/components/ui/pressable';
import { Spinner } from '@/components/ui/spinner';
import { Center } from '@/components/ui/center';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useRouter } from 'expo-router';
import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import {
  format,
  addMonths,
  subMonths,
  addWeeks,
  subWeeks,
  addDays,
  subDays,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
} from 'date-fns';
import { CalendarItem } from '@repo/types';
import { useCalendarEvents } from '../../src/hooks/useCalendar';
import { CalendarViewSwitcher, CalendarView } from '../../src/components/calendar/CalendarViewSwitcher';
import { CalendarMonthView } from '../../src/components/calendar/CalendarMonthView';
import { CalendarWeekView } from '../../src/components/calendar/CalendarWeekView';
import { CalendarDayView } from '../../src/components/calendar/CalendarDayView';
import { CalendarListView } from '../../src/components/calendar/CalendarListView';

function formatDateRange(view: CalendarView, date: Date): { from: string; to: string } {
  switch (view) {
    case 'month': {
      const s = startOfWeek(startOfMonth(date), { weekStartsOn: 0 });
      const e = endOfWeek(endOfMonth(date), { weekStartsOn: 0 });
      return { from: format(s, 'yyyy-MM-dd'), to: format(e, 'yyyy-MM-dd') };
    }
    case 'week': {
      const s = startOfWeek(date, { weekStartsOn: 0 });
      const e = endOfWeek(date, { weekStartsOn: 0 });
      return { from: format(s, 'yyyy-MM-dd'), to: format(e, 'yyyy-MM-dd') };
    }
    case 'day':
      return { from: format(date, 'yyyy-MM-dd'), to: format(date, 'yyyy-MM-dd') };
    case 'list':
      return { from: format(date, 'yyyy-MM-dd'), to: format(addDays(date, 30), 'yyyy-MM-dd') };
  }
}

export default function CalendarScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [view, setView] = useState<CalendarView>('month');
  const [currentDate, setCurrentDate] = useState(new Date());

  const { from, to } = useMemo(() => formatDateRange(view, currentDate), [view, currentDate]);

  const { data, isLoading } = useCalendarEvents(from, to);

  const items = useMemo(() => data?.items ?? [], [data]);

  const handlePrev = useCallback(() => {
    switch (view) {
      case 'month':
        setCurrentDate(prev => subMonths(prev, 1));
        break;
      case 'week':
        setCurrentDate(prev => subWeeks(prev, 1));
        break;
      case 'day':
        setCurrentDate(prev => subDays(prev, 1));
        break;
      case 'list':
        setCurrentDate(prev => subDays(prev, 30));
        break;
    }
  }, [view]);

  const handleNext = useCallback(() => {
    switch (view) {
      case 'month':
        setCurrentDate(prev => addMonths(prev, 1));
        break;
      case 'week':
        setCurrentDate(prev => addWeeks(prev, 1));
        break;
      case 'day':
        setCurrentDate(prev => addDays(prev, 1));
        break;
      case 'list':
        setCurrentDate(prev => addDays(prev, 30));
        break;
    }
  }, [view]);

  const handleToday = useCallback(() => {
    setCurrentDate(new Date());
  }, []);

  const handleSelectDate = useCallback((date: Date) => {
    setCurrentDate(date);
    setView('day');
  }, []);

  const handleSelectItem = useCallback(
    (item: CalendarItem) => {
      router.push(`/calendar/${item.kind}/${item.originalId}`);
    },
    [router]
  );

  const dateLabel = useMemo(() => {
    switch (view) {
      case 'month':
        return format(currentDate, 'MMMM yyyy');
      case 'week': {
        const s = startOfWeek(currentDate, { weekStartsOn: 0 });
        const e = endOfWeek(currentDate, { weekStartsOn: 0 });
        return `${format(s, 'MMM d')} - ${format(e, 'MMM d, yyyy')}`;
      }
      case 'day':
        return format(currentDate, 'EEEE, MMMM d, yyyy');
      case 'list':
        return format(currentDate, 'MMMM yyyy');
    }
  }, [view, currentDate]);

  return (
    <Box className="flex-1 bg-black">
      <Box className="absolute top-0 left-0 right-0 h-[300px] opacity-20">
        <LinearGradient colors={['rgba(255, 59, 48, 0.2)', 'transparent']} style={{ flex: 1 }} />
      </Box>

      <Box style={{ paddingTop: insets.top + 16 }} className="flex-1">
        <VStack className="flex-1" space="sm">
          <HStack className="px-4 items-center justify-between">
            <Pressable onPress={() => router.back()}>
              <Text className="text-[#FF3B30] text-sm font-semibold">{t('calendar.backToCalendar', 'Back')}</Text>
            </Pressable>
            <Text className="text-white text-lg font-bold">{t('calendar.title', 'Calendar')}</Text>
            <Box style={{ width: 50 }} />
          </HStack>

          <CalendarViewSwitcher activeView={view} onViewChange={setView} />

          <HStack className="px-4 items-center justify-between">
            <Pressable onPress={handlePrev} className="p-2">
              <ChevronLeft size={20} color="#737373" />
            </Pressable>
            <Pressable onPress={handleToday}>
              <Text className="text-white font-semibold">{dateLabel}</Text>
            </Pressable>
            <Pressable onPress={handleNext} className="p-2">
              <ChevronRight size={20} color="#737373" />
            </Pressable>
          </HStack>

          <Box className="flex-1">
            {isLoading ? (
              <Center className="flex-1">
                <Spinner size="large" className="text-brand-600" />
              </Center>
            ) : view === 'month' ? (
              <ScrollView className="flex-1">
                <CalendarMonthView
                  currentMonth={currentDate}
                  items={items}
                  onSelectDate={handleSelectDate}
                  onSelectItem={handleSelectItem}
                />
              </ScrollView>
            ) : view === 'week' ? (
              <CalendarWeekView
                currentDate={currentDate}
                items={items}
                onSelectDate={handleSelectDate}
                onSelectItem={handleSelectItem}
              />
            ) : view === 'day' ? (
              <CalendarDayView currentDate={currentDate} items={items} onSelectItem={handleSelectItem} />
            ) : (
              <CalendarListView items={items} onSelectItem={handleSelectItem} />
            )}
          </Box>
        </VStack>
      </Box>
    </Box>
  );
}
