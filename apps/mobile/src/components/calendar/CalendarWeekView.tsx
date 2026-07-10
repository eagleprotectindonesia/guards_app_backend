import { useMemo } from 'react';
import { View, ScrollView } from 'react-native';
import { HStack } from '@/components/ui/hstack';
import { VStack } from '@/components/ui/vstack';
import { Box } from '@/components/ui/box';
import { Text } from '@/components/ui/text';
import { Pressable } from '@/components/ui/pressable';
import { CalendarItem } from '@repo/types';
import {
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  isToday,
  isSameDay,
  format,
} from 'date-fns';
import { useTranslation } from 'react-i18next';
import { CalendarEventCard } from './CalendarEventCard';

export function CalendarWeekView({
  currentDate,
  items,
  onSelectDate,
  onSelectItem,
}: {
  currentDate: Date;
  items: CalendarItem[];
  onSelectDate: (date: Date) => void;
  onSelectItem: (item: CalendarItem) => void;
}) {
  const { t } = useTranslation();

  const daysInWeek = useMemo(() => {
    const start = startOfWeek(currentDate, { weekStartsOn: 0 });
    const end = endOfWeek(currentDate, { weekStartsOn: 0 });
    return eachDayOfInterval({ start, end });
  }, [currentDate]);

  const selectedDay = currentDate;

  const dayItems = useMemo(
    () => items.filter(item => item.date === format(selectedDay, 'yyyy-MM-dd')),
    [items, selectedDay]
  );

  const timeSlots = useMemo(() => {
    const slots: string[] = [];
    for (let h = 0; h < 24; h++) {
      slots.push(`${h.toString().padStart(2, '0')}:00`);
    }
    return slots;
  }, []);

  const nonAllDayItems = useMemo(
    () => dayItems.filter(item => !item.allDay),
    [dayItems]
  );
  const allDayItems = useMemo(
    () => dayItems.filter(item => item.allDay),
    [dayItems]
  );

  return (
    <VStack className="flex-1">
      <ScrollView horizontal showsHorizontalScrollIndicator={false} className="px-2 py-2">
        <HStack space="sm">
          {daysInWeek.map((day, idx) => {
            const today = isToday(day);
            const selected = isSameDay(day, selectedDay);
            return (
              <Pressable
                key={idx}
                onPress={() => onSelectDate(day)}
                className={`items-center py-2 px-3 rounded-xl ${
                  selected ? 'bg-[#FF3B30]' : today ? 'bg-[#1A1A1A]' : ''
                }`}
              >
                <Text className="text-[#737373] text-xs font-semibold">
                  {format(day, 'EEE')}
                </Text>
                <Text
                  className={`text-lg font-bold mt-1 ${
                    selected ? 'text-white' : 'text-white'
                  }`}
                >
                  {format(day, 'd')}
                </Text>
              </Pressable>
            );
          })}
        </HStack>
      </ScrollView>

      <ScrollView className="flex-1 px-2">
        {allDayItems.length > 0 && (
          <Box className="mb-2 bg-[#1A1A1A] rounded-xl p-3 border border-white/5">
            <Text className="text-xs font-bold text-[#737373] uppercase tracking-wide mb-2">
              {t('calendar.allDay', 'All day')}
            </Text>
            <VStack space="xs">
              {allDayItems.map(item => (
                <CalendarEventCard
                  key={item.id}
                  item={item}
                  onPress={() => onSelectItem(item)}
                  compact
                />
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

          return (
            <View
              key={hour}
              className="flex-row border-b border-[#1a1a1a]"
              style={{ minHeight: 48 }}
            >
              <View className="w-14 py-1 pr-2">
                <Text className="text-[#737373] text-xs text-right">{hour}</Text>
              </View>
              <View className="flex-1 ml-1 py-0.5">
                {itemsAtHour.length > 0 ? (
                  <VStack space="xs">
                    {itemsAtHour.map(item => (
                      <CalendarEventCard
                        key={item.id}
                        item={item}
                        onPress={() => onSelectItem(item)}
                      />
                    ))}
                  </VStack>
                ) : null}
              </View>
            </View>
          );
        })}

        {dayItems.length === 0 && (
          <Box className="py-12 items-center">
            <Text className="text-[#737373]">{t('calendar.noEvents', 'No events on this day')}</Text>
          </Box>
        )}
      </ScrollView>
    </VStack>
  );
}
