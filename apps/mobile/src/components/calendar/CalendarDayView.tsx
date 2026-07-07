import { useMemo } from 'react';
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
  const dateStr = format(currentDate, 'yyyy-MM-dd');

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
    <ScrollView className="flex-1 px-3">
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

        const isPastHour = new Date().getHours() > hourNum;

        return (
          <View
            key={hour}
            className={`flex-row border-b border-[#1a1a1a] ${isPastHour ? 'opacity-40' : ''}`}
            style={{ minHeight: 52 }}
          >
            <View className="w-14 py-1.5 pr-2">
              <Text className="text-[#737373] text-xs text-right">{hour}</Text>
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
