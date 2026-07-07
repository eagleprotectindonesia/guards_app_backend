import { View, ScrollView, StyleSheet, Alert } from 'react-native';
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
import {
  ChevronLeft,
  Calendar,
  MapPin,
  Sun,
  Moon,
  FileText,
  Tag,
  AlertCircle,
  Briefcase,
  UserRound,
  Bell,
  CheckSquare,
  AlertTriangle,
  Repeat,
  GraduationCap,
  CalendarHeart,
  Pencil,
  Trash2,
  Copy,
  Users,
  Shield,
} from 'lucide-react-native';
import { format, parseISO } from 'date-fns';
import { useCalendarItem, useDeleteCalendarEvent, useDuplicateCalendarEvent } from '../../../src/hooks/useCalendar';

const USER_EVENT_KINDS = new Set([
  'meeting', 'client_meeting', 'reminder', 'task', 'deadline',
  'follow_up', 'training', 'personal_event', 'other',
]);

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

function ActionButton({ icon, label, color, onPress }: { icon: React.ReactNode; label: string; color: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      className="flex-1 py-3.5 rounded-xl items-center justify-center flex-row"
      style={{ backgroundColor: `${color}15` }}
    >
      {icon}
      <Text className="text-sm font-semibold ml-2" style={{ color }}>{label}</Text>
    </Pressable>
  );
}

function KindHeader({ kind }: { kind: string }) {
  const icons: Record<string, { icon: React.ReactNode; color: string }> = {
    holiday: { icon: <Sun size={24} color="#FF9500" />, color: '#FF9500' },
    office_memo: { icon: <FileText size={24} color="#AF52DE" />, color: '#AF52DE' },
    leave: { icon: <Moon size={24} color="#34C759" />, color: '#34C759' },
    meeting: { icon: <Briefcase size={24} color="#FF3B30" />, color: '#FF3B30' },
    client_meeting: { icon: <UserRound size={24} color="#FF2D55" />, color: '#FF2D55' },
    reminder: { icon: <Bell size={24} color="#FF9500" />, color: '#FF9500' },
    task: { icon: <CheckSquare size={24} color="#34C759" />, color: '#34C759' },
    deadline: { icon: <AlertTriangle size={24} color="#FF3B30" />, color: '#FF3B30' },
    follow_up: { icon: <Repeat size={24} color="#FF9500" />, color: '#FF9500' },
    training: { icon: <GraduationCap size={24} color="#007AFF" />, color: '#007AFF' },
    personal_event: { icon: <CalendarHeart size={24} color="#007AFF" />, color: '#007AFF' },
    other: { icon: <Calendar size={24} color="#AF52DE" />, color: '#AF52DE' },
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

function PriorityBadge({ priority }: { priority: string | null }) {
  if (!priority || priority === 'normal') return null;
  const color = priority === 'urgent' ? '#FF3B30' : priority === 'high' ? '#FF9500' : '#8E8E93';
  return (
    <Box className="px-2 py-0.5 rounded-full" style={{ backgroundColor: `${color}20` }}>
      <Text className="text-xs font-bold uppercase" style={{ color }}>{priority}</Text>
    </Box>
  );
}

export default function CalendarItemDetailScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { type, id } = useLocalSearchParams<{ type: string; id: string }>();

  const { data, isLoading, error } = useCalendarItem(type!, id!);
  const deleteMutation = useDeleteCalendarEvent();
  const duplicateMutation = useDuplicateCalendarEvent();

  const item = data?.item;
  const kind = type ?? '';
  const isUserEvent = USER_EVENT_KINDS.has(kind);

  const handleDelete = () => {
    Alert.alert(
      t('calendar.deleteEvent', 'Delete Event'),
      t('calendar.deleteEventMessage', 'Are you sure you want to delete this event?'),
      [
        { text: t('calendar.cancel', 'Cancel'), style: 'cancel' },
        {
          text: t('calendar.deleteConfirm', 'Delete'),
          style: 'destructive',
          onPress: () => {
            deleteMutation.mutate(id!, {
              onSuccess: () => {
                router.back();
              },
            });
          },
        },
      ]
    );
  };

  const handleDuplicate = () => {
    duplicateMutation.mutate(id!, {
      onSuccess: () => {
        router.back();
      },
    });
  };

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
                    <KindHeader kind={kind} />
                    <VStack className="flex-1">
                      <HStack space="sm" className="items-center">
                        <Text className="text-white text-xl font-bold flex-1">{String(item.data?.title ?? '')}</Text>
                        <PriorityBadge priority={item.data?.priority ? String(item.data.priority) : null} />
                      </HStack>
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
                    icon={<UserRound size={16} color="#737373" />}
                    label={t('calendar.clientName', 'Client Name')}
                    value={item.data?.clientName ? String(item.data.clientName) : null}
                  />

                  <DetailRow
                    icon={<GraduationCap size={16} color="#737373" />}
                    label={t('calendar.trainerName', 'Trainer')}
                    value={item.data?.trainerName ? String(item.data.trainerName) : null}
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

                  {/* Tagged Users */}
                  {(() => {
                    const rawTags = (item.data as Record<string, unknown>)?.taggedUsers;
                    const tags = Array.isArray(rawTags) ? (rawTags as Array<{id: string; type: string; name: string; email?: string}>) : [];
                    if (tags.length === 0) return null;
                    return (
                      <VStack space="sm" className="pt-2 border-t border-white/5">
                        <Text className="text-[#737373] text-xs font-semibold uppercase tracking-wide">
                          {t('calendar.taggedUsers', 'Tagged Users')}
                        </Text>
                        {tags.map((tu) => (
                        <HStack key={`${tu.type}:${tu.id}`} space="sm" className="items-center py-1">
                          <Box className="w-7 h-7 rounded-full bg-[#2C2C2E] items-center justify-center">
                            {tu.type === 'admin' ? (
                              <Shield size={14} color="#AF52DE" />
                            ) : (
                              <UserRound size={14} color="#007AFF" />
                            )}
                          </Box>
                          <VStack className="flex-1">
                            <Text className="text-white text-sm">{tu.name}</Text>
                            <Text className="text-[#737373] text-xs">
                              {tu.type === 'admin' ? t('calendar.adminTag', 'Admin') : t('calendar.employeeTag', 'Employee')}
                            </Text>
                          </VStack>
                        </HStack>
                      ))}
                    </VStack>
                  );
                })()}
                </VStack>
              </View>

              {(isUserEvent && item.data?.isOwner === true) && (
                <VStack space="sm" className="mt-6">
                  <HStack space="sm">
                    <ActionButton
                      icon={<Pencil size={18} color="#007AFF" />}
                      label={t('calendar.editEvent', 'Edit')}
                      color="#007AFF"
                      onPress={() => router.push(`/calendar/events/${id}/edit`)}
                    />
                    <ActionButton
                      icon={<Trash2 size={18} color="#FF3B30" />}
                      label={t('calendar.deleteEvent', 'Delete')}
                      color="#FF3B30"
                      onPress={handleDelete}
                    />
                  </HStack>
                  <ActionButton
                    icon={<Copy size={18} color="#AF52DE" />}
                    label={t('calendar.duplicate', 'Duplicate')}
                    color="#AF52DE"
                    onPress={handleDuplicate}
                  />
                </VStack>
              )}
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
