import { Box } from '@/components/ui/box';
import { HStack } from '@/components/ui/hstack';
import { VStack } from '@/components/ui/vstack';
import { Text } from '@/components/ui/text';
import { Pressable } from '@/components/ui/pressable';
import { CalendarItem } from '@repo/types';
import { format, parseISO } from 'date-fns';
import { Calendar, Clock, MapPin, Sun, Moon, FileText } from 'lucide-react-native';

function getKindIcon(kind: string, color: string) {
  switch (kind) {
    case 'holiday':
      return <Sun size={14} color={color} />;
    case 'leave':
      return <Moon size={14} color={color} />;
    case 'office_memo':
      return <FileText size={14} color={color} />;
    default:
      return <Calendar size={14} color={color} />;
  }
}

function formatTimeRange(item: CalendarItem): string | null {
  if (item.allDay) return 'All day';
  if (item.startsAt) {
    const start = format(parseISO(item.startsAt), 'HH:mm');
    if (item.endsAt) {
      const end = format(parseISO(item.endsAt), 'HH:mm');
      return `${start} - ${end}`;
    }
    return start;
  }
  return null;
}

function getKindLabel(kind: string): string {
  switch (kind) {
    case 'holiday':
      return 'Holiday';
    case 'leave':
      return 'Leave';
    case 'office_memo':
      return 'Memo';
    default:
      return kind;
  }
}

export function CalendarEventCard({
  item,
  onPress,
  compact = false,
}: {
  item: CalendarItem;
  onPress: () => void;
  compact?: boolean;
}) {
  const timeStr = formatTimeRange(item);
  const kindColor = item.colorHint || '#FF3B30';
  const icon = getKindIcon(item.kind, kindColor);

  if (compact) {
    return (
      <Pressable onPress={onPress}>
        <Box className="flex-row items-center py-1.5 px-2 bg-[#0D0D0D] rounded-lg border border-white/5">
          <Box className="w-1.5 h-full rounded-full mr-2" style={{ backgroundColor: kindColor }} />
          <VStack className="flex-1">
            <Text className="text-white text-sm font-semibold" numberOfLines={1}>
              {item.title}
            </Text>
            {timeStr && <Text className="text-[#737373] text-xs">{timeStr}</Text>}
          </VStack>
        </Box>
      </Pressable>
    );
  }

  return (
    <Pressable onPress={onPress}>
      <Box className="bg-[#0D0D0D] rounded-xl border border-white/5 p-3">
        <HStack space="sm" className="items-center mb-1">
          <Box className="w-1.5 h-full rounded-full" style={{ backgroundColor: kindColor }} />
          <VStack className="flex-1">
            <HStack space="xs" className="items-center">
              {icon}
              <Text className="text-white text-sm font-semibold flex-shrink" numberOfLines={1}>
                {item.title}
              </Text>
            </HStack>
          </VStack>
          <Box className="px-2 py-0.5 rounded-full" style={{ backgroundColor: `${kindColor}20` }}>
            <Text className="text-xs font-semibold" style={{ color: kindColor }}>
              {getKindLabel(item.kind)}
            </Text>
          </Box>
        </HStack>

        {timeStr && (
          <HStack space="xs" className="items-center ml-4">
            <Clock size={12} color="#737373" />
            <Text className="text-[#737373] text-xs">{timeStr}</Text>
          </HStack>
        )}

        {item.location && (
          <HStack space="xs" className="items-center ml-4 mt-1">
            <MapPin size={12} color="#737373" />
            <Text className="text-[#737373] text-xs" numberOfLines={1}>
              {item.location}
            </Text>
          </HStack>
        )}

        {item.status && (
          <HStack space="xs" className="items-center ml-4 mt-1">
            <Text className="text-[#737373] text-xs">{item.status}</Text>
          </HStack>
        )}
      </Box>
    </Pressable>
  );
}
