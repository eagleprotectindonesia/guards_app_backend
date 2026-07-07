import { useMemo } from 'react';
import { View } from 'react-native';
import { Box } from '@/components/ui/box';
import { Text } from '@/components/ui/text';
import { useTranslation } from 'react-i18next';
import { CalendarItem } from '@repo/types';
import {
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  isToday,
  isSameMonth,
  format,
} from 'date-fns';

const EVENTS_PER_CELL_SHOWN = 2;

function getItemsForDate(items: CalendarItem[], date: Date): CalendarItem[] {
  const dateStr = format(date, 'yyyy-MM-dd');
  return items.filter(item => item.date === dateStr);
}

const DAY_HEADERS_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

export function CalendarMonthView({
  currentMonth,
  items,
  onSelectDate,
  onSelectItem,
}: {
  currentMonth: Date;
  items: CalendarItem[];
  onSelectDate: (date: Date) => void;
  onSelectItem: (item: CalendarItem) => void;
}) {
  const { t } = useTranslation();
  const weeks = useMemo(() => {
    const monthStart = startOfMonth(currentMonth);
    const monthEnd = endOfMonth(currentMonth);
    const calStart = startOfWeek(monthStart, { weekStartsOn: 0 });
    const calEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });
    const days = eachDayOfInterval({ start: calStart, end: calEnd });

    const w: Date[][] = [];
    for (let i = 0; i < days.length; i += 7) {
      w.push(days.slice(i, i + 7));
    }
    return w;
  }, [currentMonth]);

  return (
    <Box className="px-2">
      <View className="flex-row mb-1">
        {DAY_HEADERS_KEYS.map(k => (
          <View key={k} className="flex-1 items-center py-2">
            <Text className="text-[#737373] text-xs font-semibold">{t(`calendar.${k}`, k)}</Text>
          </View>
        ))}
      </View>

      {weeks.map((week, wi) => (
        <View key={wi} className="flex-row">
          {week.map((day, di) => {
            const inMonth = isSameMonth(day, currentMonth);
            const today = isToday(day);
            const dayItems = getItemsForDate(items, day);

            return (
              <View key={di} className="flex-1 items-center py-1" style={{ minHeight: 56 }}>
                <View
                  onTouchEnd={() => onSelectDate(day)}
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 16,
                    backgroundColor: today ? '#FF3B30' : 'transparent',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Text
                    className={`text-sm font-semibold ${
                      !inMonth ? 'text-[#3A3A3A]' : today ? 'text-white' : 'text-white'
                    }`}
                  >
                    {format(day, 'd')}
                  </Text>
                </View>

                {inMonth && dayItems.length > 0 && (
                  <View className="mt-0.5 w-full items-center">
                    <View className="flex-row flex-wrap justify-center gap-0.5">
                      {dayItems.slice(0, EVENTS_PER_CELL_SHOWN).map((item, idx) => (
                        <View
                          key={`${item.id}-${idx}`}
                          style={{
                            width: 6,
                            height: 6,
                            borderRadius: 3,
                            backgroundColor: item.colorHint || '#FF3B30',
                          }}
                        />
                      ))}
                    </View>
                    {dayItems.length > EVENTS_PER_CELL_SHOWN && (
                      <Text className="text-[#737373] text-[10px] mt-0.5">
                        {t('calendar.moreEvents', '+{count} more', { count: dayItems.length - EVENTS_PER_CELL_SHOWN })}
                      </Text>
                    )}
                  </View>
                )}
              </View>
            );
          })}
        </View>
      ))}
    </Box>
  );
}
