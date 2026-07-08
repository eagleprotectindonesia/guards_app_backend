import { useMemo, useRef, useEffect } from 'react';
import { ScrollView, View } from 'react-native';
import { VStack } from '@/components/ui/vstack';
import { Box } from '@/components/ui/box';
import { Text } from '@/components/ui/text';
import { CalendarItem } from '@repo/types';
import { format } from 'date-fns';
import { useTranslation } from 'react-i18next';
import { CalendarEventCard } from './CalendarEventCard';

export function CalendarDayView({
  currentDate,
  items,
  onSelectItem,
}: {
  currentDate: Date;
  items: CalendarItem[];
  onSelectItem: (item: CalendarItem) => void;
}) {
  const { t } = useTranslation();
  const scrollViewRef = useRef<ScrollView>(null);
  const dateStr = format(currentDate, 'yyyy-MM-dd');
  const isToday = dateStr === format(new Date(), 'yyyy-MM-dd');
  const currentHour = new Date().getHours();

  useEffect(() => {
    if (isToday) {
      const timer = setTimeout(() => {
        scrollViewRef.current?.scrollTo({ y: currentHour * 52, animated: true });
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [isToday, currentHour]);

  const dayItems = useMemo(() => items.filter(item => item.date === dateStr), [items, dateStr]);

  const nonAllDayItems = useMemo(() => dayItems.filter(item => !item.allDay), [dayItems]);
  const allDayItems = useMemo(() => dayItems.filter(item => item.allDay), [dayItems]);

  const timeSlots = useMemo(() => {
    const slots: string[] = [];
    for (let h = 0; h < 24; h++) {
      slots.push(`${h.toString().padStart(2, '0')}:00`);
    }
    return slots;
  }, []);

  return (
    <ScrollView ref={scrollViewRef} className="flex-1 px-3">
      {allDayItems.length > 0 && (
        <Box className="mb-3 bg-[#1A1A1A] rounded-xl p-3 border border-white/5">
          <Text className="text-xs font-bold text-[#737373] uppercase tracking-wide mb-2">
            {t('calendar.allDay', 'All day')}
          </Text>
          <VStack space="xs">
            {allDayItems.map(item => (
              <CalendarEventCard key={item.id} item={item} onPress={() => onSelectItem(item)} />
            ))}
          </VStack>
        </Box>
      )}

      {timeSlots.map(hour => {
        const hourNum = parseInt(hour, 10);
        const itemsAtHour = nonAllDayItems.filter(item => {
          if (!item.startsAt) return false;
          const h = new Date(item.startsAt).getHours();
          return h === hourNum;
        });

        const isPastHour = isToday && hourNum < currentHour;
        const isCurrentHour = isToday && hourNum === currentHour;

        return (
          <View
            key={hour}
            className={`flex-row border-b border-[#1a1a1a] ${isPastHour ? 'bg-[#0E0E0F]' : ''} ${isCurrentHour ? 'bg-[#1C1A1A] border-l-2 border-l-[#FF3B30]' : ''}`}
            style={{ minHeight: 52 }}
          >
            <View className="w-14 py-1.5 pr-2 flex-row items-center justify-end gap-1">
              <Text
                className={`text-xs text-right ${isPastHour ? 'text-[#4A4A4E]' : ''} ${isCurrentHour ? 'text-[#FF3B30] font-bold' : ''} ${!isPastHour && !isCurrentHour ? 'text-[#737373]' : ''}`}
              >
                {hour}
              </Text>
              {isCurrentHour && (
                <View className="w-1.5 h-1.5 rounded-full bg-[#FF3B30]" />
              )}
            </View>
            <View className="flex-1 ml-1 py-0.5">
              {itemsAtHour.length > 0 ? (
                <VStack space="xs">
                  {itemsAtHour.map(item => (
                    <CalendarEventCard key={item.id} item={item} onPress={() => onSelectItem(item)} />
                  ))}
                </VStack>
              ) : null}
            </View>
          </View>
        );
      })}

      {dayItems.length === 0 && (
        <Box className="py-20 items-center">
          <Text className="text-[#737373]">{t('calendar.noEvents', 'No events on this day')}</Text>
        </Box>
      )}
    </ScrollView>
  );
}
