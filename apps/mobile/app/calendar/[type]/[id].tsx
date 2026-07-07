import { View, ScrollView, StyleSheet } from 'react-native';
import { BlurView } from 'expo-blur';
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
import { useRouter, useLocalSearchParams } from 'expo-router';
import { ChevronLeft, Calendar, MapPin, Sun, Moon, FileText, Tag, AlertCircle } from 'lucide-react-native';
import { format, parseISO } from 'date-fns';
import { useCalendarItem } from '../../../src/hooks/useCalendar';

function StatusBadge({ status }: { status: string | null }) {
  if (!status) return null;
  const color =
    status === 'approved' || status === 'in_progress' || status === 'completed'
      ? '#34C759'
      : status === 'scheduled' || status === 'pending'
        ? '#FFEB3B'
        : status === 'rejected' || status === 'cancelled' || status === 'missed'
          ? '#FF3B30'
          : '#FF9500';
  return (
    <Box className="px-2.5 py-0.5 rounded-full self-start" style={{ backgroundColor: `${color}20` }}>
      <Text className="text-xs font-bold uppercase tracking-wide" style={{ color }}>
        {status.replace(/_/g, ' ')}
      </Text>
    </Box>
  );
}

function DetailRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string | null }) {
  if (!value) return null;
  return (
    <HStack space="sm" className="items-start py-2">
      <Box className="pt-0.5">{icon}</Box>
      <VStack className="flex-1">
        <Text className="text-[#737373] text-xs font-semibold uppercase tracking-wide">{label}</Text>
        <Text className="text-white text-sm mt-0.5">{value}</Text>
      </VStack>
    </HStack>
  );
}

function KindHeader({ kind }: { kind: string }) {
  const icons: Record<string, { icon: React.ReactNode; color: string }> = {
    holiday: { icon: <Sun size={24} color="#FF9500" />, color: '#FF9500' },
    office_memo: { icon: <FileText size={24} color="#AF52DE" />, color: '#AF52DE' },
    leave: { icon: <Moon size={24} color="#34C759" />, color: '#34C759' },
  };
  const info = icons[kind] || { icon: <Calendar size={24} color="#FF3B30" />, color: '#FF3B30' };
  return (
    <Box
      className="w-10 h-10 rounded-xl items-center justify-center border"
      style={{ backgroundColor: `${info.color}20`, borderColor: `${info.color}30` }}
    >
      {info.icon}
    </Box>
  );
}

export default function CalendarItemDetailScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { type, id } = useLocalSearchParams<{ type: string; id: string }>();

  const { data, isLoading, error } = useCalendarItem(type!, id!);

  const item = data?.item;

  return (
    <Box className="flex-1 bg-black overflow-hidden">
      <Box className="absolute top-0 left-0 right-0 h-[300px] opacity-20">
        <LinearGradient colors={['rgba(255, 59, 48, 0.2)', 'transparent']} style={{ flex: 1 }} />
      </Box>

      <Box style={{ paddingTop: insets.top + 16 }} className="flex-1">
        <HStack className="px-4 items-center mb-4">
          <Pressable onPress={() => router.back()}>
            <ChevronLeft size={24} color="white" />
          </Pressable>
          <Text className="text-white text-lg font-bold ml-3 flex-1">{t('calendar.eventDetail', 'Event Details')}</Text>
        </HStack>

        {isLoading ? (
          <Center className="flex-1">
            <Spinner size="large" className="text-brand-600" />
          </Center>
        ) : error || !item ? (
          <Center className="flex-1 px-6">
            <AlertCircle size={40} color="#FF3B30" />
            <Text className="text-white text-lg font-semibold mt-4">{t('calendar.noEventsTitle', 'No Events')}</Text>
            <Text className="text-[#737373] text-center mt-2">{t('calendar.noEvents', 'No events on this day')}</Text>
          </Center>
        ) : (
          <ScrollView contentContainerStyle={{ paddingBottom: 100 }} showsVerticalScrollIndicator={false}>
            <Box className="px-4">
              <View style={styles.glassCard}>
                <BlurView intensity={20} tint="dark" style={StyleSheet.absoluteFill} />
                <VStack space="md" className="p-6">
                  <HStack space="md" className="items-center">
                    <KindHeader kind={item.kind} />
                    <VStack className="flex-1">
                      <Text className="text-white text-xl font-bold">{String(item.data?.title ?? '')}</Text>
                      <StatusBadge status={item.data?.status ? String(item.data.status) : null} />
                    </VStack>
                  </HStack>

                  <DetailRow
                    icon={<Calendar size={16} color="#737373" />}
                    label={t('calendar.time', 'Time')}
                    value={
                      item.data?.date
                        ? `${String(item.data.date)}${item.data?.startsAt ? ` ${format(parseISO(String(item.data.startsAt)), 'HH:mm')} - ${item.data?.endsAt ? format(parseISO(String(item.data.endsAt)), 'HH:mm') : ''}` : ''}`
                        : item.data?.startDate && item.data?.endDate
                          ? `${format(parseISO(String(item.data.startDate)), 'MMM d')} - ${format(parseISO(String(item.data.endDate)), 'MMM d, yyyy')}`
                          : null
                    }
                  />

                  <DetailRow
                    icon={<MapPin size={16} color="#737373" />}
                    label={t('calendar.location', 'Location')}
                    value={String(item.data?.siteName ?? item.data?.location ?? '') || null}
                  />

                  <DetailRow
                    icon={<FileText size={16} color="#737373" />}
                    label={t('calendar.notes', 'Notes')}
                    value={String(item.data?.note ?? item.data?.notes ?? item.data?.description ?? '') || null}
                  />

                  <DetailRow
                    icon={<Tag size={16} color="#737373" />}
                    label={t('calendar.status', 'Status')}
                    value={item.data?.shiftTypeName ? String(item.data.shiftTypeName) : null}
                  />

                  <DetailRow
                    icon={<Tag size={16} color="#737373" />}
                    label="Type"
                    value={item.data?.type ? String(item.data.type) : null}
                  />

                  <DetailRow
                    icon={<Tag size={16} color="#737373" />}
                    label="Reason"
                    value={item.data?.reason ? String(item.data.reason) : null}
                  />

                  <DetailRow
                    icon={<FileText size={16} color="#737373" />}
                    label="Admin Note"
                    value={item.data?.adminNote ? String(item.data.adminNote) : null}
                  />
                </VStack>
              </View>
            </Box>
          </ScrollView>
        )}
      </Box>
    </Box>
  );
}

const styles = StyleSheet.create({
  glassCard: {
    borderRadius: 32,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
    backgroundColor: 'rgba(25, 25, 27, 0.6)',
  },
});
