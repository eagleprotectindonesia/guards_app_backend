import { memo } from 'react';
import { Linking } from 'react-native';
import { Box } from '@/components/ui/box';
import { HStack } from '@/components/ui/hstack';
import { VStack } from '@/components/ui/vstack';
import { Text } from '@/components/ui/text';
import { Pressable } from '@/components/ui/pressable';
import { CalendarItem } from '@repo/types';
import { useTranslation } from 'react-i18next';
import { format, parseISO } from 'date-fns';
import {
  Calendar,
  Clock,
  MapPin,
  Sun,
  Moon,
  FileText,
  Briefcase,
  UserRound,
  Bell,
  CheckSquare,
  AlertTriangle,
  Repeat,
  GraduationCap,
  CalendarHeart,
} from 'lucide-react-native';

function getKindIcon(kind: string, color: string) {
  switch (kind) {
    case 'holiday':
      return <Sun size={14} color={color} />;
    case 'leave':
      return <Moon size={14} color={color} />;
    case 'office_memo':
      return <FileText size={14} color={color} />;
    case 'meeting':
      return <Briefcase size={14} color={color} />;
    case 'client_meeting':
      return <UserRound size={14} color={color} />;
    case 'reminder':
      return <Bell size={14} color={color} />;
    case 'task':
      return <CheckSquare size={14} color={color} />;
    case 'deadline':
      return <AlertTriangle size={14} color={color} />;
    case 'follow_up':
      return <Repeat size={14} color={color} />;
    case 'training':
      return <GraduationCap size={14} color={color} />;
    case 'personal_event':
      return <CalendarHeart size={14} color={color} />;
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

import { KIND_LABELS } from '@repo/shared';

function getKindLabel(kind: string): string {
  return KIND_LABELS[kind] ?? kind;
}

export const CalendarEventCard = memo(function CalendarEventCard({
  item,
  onPress,
  compact = false,
}: {
  item: CalendarItem;
  onPress: () => void;
  compact?: boolean;
}) {
  const { t } = useTranslation();
  const timeStr = formatTimeRange(item)?.replace('All day', t('calendar.allDay', 'All day'));
  const kindColor = item.colorHint || '#FF3B30';
  const icon = getKindIcon(item.kind, kindColor);
  const kindLabel = getKindLabel(item.kind);

  const a11yLabel = `${kindLabel}: ${item.title}${timeStr ? ', ' + timeStr : ''}`;

  if (compact) {
    return (
      <Pressable onPress={onPress} accessibilityLabel={a11yLabel}>
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
    <Pressable onPress={onPress} accessibilityLabel={a11yLabel}>
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
              {kindLabel}
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

        {item.latitude != null && item.longitude != null && (
          <Pressable
            onPress={() => Linking.openURL(`https://maps.google.com/?q=${item.latitude},${item.longitude}`)}
            accessibilityLabel="Open in Maps"
          >
            <HStack space="xs" className="items-center ml-4 mt-1">
              <MapPin size={12} color="#FF3B30" />
              <Text className="text-[#FF3B30] text-xs">Open in Maps</Text>
            </HStack>
          </Pressable>
        )}

        {item.status && (
          <HStack space="xs" className="items-center ml-4 mt-1">
            <Text className="text-[#737373] text-xs">{item.status}</Text>
          </HStack>
        )}
      </Box>
    </Pressable>
  );
});
