import { useMemo } from 'react';
import { FlatList, View } from 'react-native';
import { VStack } from '@/components/ui/vstack';
import { Box } from '@/components/ui/box';
import { Text } from '@/components/ui/text';
import { useTranslation } from 'react-i18next';
import { CalendarItem } from '@repo/types';
import { format, parseISO } from 'date-fns';
import { CalendarEventCard } from './CalendarEventCard';

type GroupedItems = {
  date: string;
  items: CalendarItem[];
};

export function CalendarListView({
  items,
  onSelectItem,
  refreshing,
  onRefresh,
}: {
  items: CalendarItem[];
  onSelectItem: (item: CalendarItem) => void;
  refreshing?: boolean;
  onRefresh?: () => void;
}) {
  const { t } = useTranslation();
  const grouped = useMemo(() => {
    const map = new Map<string, CalendarItem[]>();
    for (const item of items) {
      const existing = map.get(item.date) ?? [];
      existing.push(item);
      map.set(item.date, existing);
    }

    const result: GroupedItems[] = [];
    for (const [date, dayItems] of map) {
      result.push({ date, items: dayItems });
    }
    result.sort((a, b) => a.date.localeCompare(b.date));
    return result;
  }, [items]);

  const formatDateLabel = (dateStr: string) => {
    try {
      const d = parseISO(dateStr);
      const today = new Date();
      const tomorrow = new Date(today);
      tomorrow.setDate(today.getDate() + 1);
      const yesterday = new Date(today);
      yesterday.setDate(today.getDate() - 1);

      if (dateStr === format(today, 'yyyy-MM-dd')) return t('calendar.today', 'Today');
      if (dateStr === format(tomorrow, 'yyyy-MM-dd')) return t('calendar.tomorrow', 'Tomorrow');
      if (dateStr === format(yesterday, 'yyyy-MM-dd')) return t('calendar.yesterday', 'Yesterday');

      return format(d, 'EEE, MMM d');
    } catch {
      return dateStr;
    }
  };

  return (
    <FlatList
      data={grouped}
      keyExtractor={item => item.date}
      refreshing={refreshing}
      onRefresh={onRefresh}
      contentContainerClassName="px-3 pb-8"
      showsVerticalScrollIndicator={false}
      ListEmptyComponent={
        <Box className="py-20 items-center">
          <Text className="text-[#737373]">No events found</Text>
        </Box>
      }
      renderItem={({ item: group }) => (
        <View className="mb-4">
          <Text className="text-[#737373] text-xs font-bold uppercase tracking-wide mb-2 ml-1">
            {formatDateLabel(group.date)}
          </Text>
          <VStack space="sm">
            {group.items.map(item => (
              <CalendarEventCard key={item.id} item={item} onPress={() => onSelectItem(item)} />
            ))}
          </VStack>
        </View>
      )}
    />
  );
}
