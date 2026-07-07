import { Box } from '@/components/ui/box';
import { HStack } from '@/components/ui/hstack';
import { Text } from '@/components/ui/text';
import { Pressable } from '@/components/ui/pressable';
import { Spinner } from '@/components/ui/spinner';
import { Center } from '@/components/ui/center';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { ChevronLeft, AlertCircle } from 'lucide-react-native';
import { CalendarEventForm } from '../../../../src/components/calendar/CalendarEventForm';
import { useCalendarItem, useUpdateCalendarEvent } from '../../../../src/hooks/useCalendar';
import { useCustomToast } from '../../../../src/hooks/useCustomToast';

export default function EditCalendarEventScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const toast = useCustomToast();
  const { id, kind: kindParam } = useLocalSearchParams<{ id: string; kind?: string }>();

  const eventKind = kindParam ?? 'meeting';
  const { data, isLoading, error } = useCalendarItem(eventKind, id!);
  const updateMutation = useUpdateCalendarEvent();

  if (isLoading) {
    return (
      <Box className="flex-1 bg-black">
        <Box style={{ paddingTop: insets.top + 16 }}>
          <Center className="flex-1">
            <Spinner size="large" className="text-brand-600" />
          </Center>
        </Box>
      </Box>
    );
  }

  if (error || !data?.item?.data) {
    return (
      <Box className="flex-1 bg-black">
        <Box className="absolute top-0 left-0 right-0 h-[300px] opacity-20">
          <LinearGradient colors={['rgba(255, 59, 48, 0.2)', 'transparent']} style={{ flex: 1 }} />
        </Box>
        <Box style={{ paddingTop: insets.top + 16 }} className="flex-1">
          <HStack className="px-4 items-center mb-4">
            <Pressable onPress={() => router.back()}>
              <ChevronLeft size={24} color="white" />
            </Pressable>
            <Text className="text-white text-lg font-bold ml-3">{t('calendar.editEvent', 'Edit Event')}</Text>
          </HStack>
          <Center className="flex-1 px-6">
            <AlertCircle size={40} color="#FF3B30" />
            <Text className="text-white text-lg font-semibold mt-4">{t('calendar.noEventsTitle', 'No Events')}</Text>
          </Center>
        </Box>
      </Box>
    );
  }

  const d = data.item.data;
  const formatDate = (val: unknown) => {
    if (!val) return undefined;
    return String(val).slice(0, 10);
  };

  const initialData = {
    kind: (d.kind as any) ?? 'personal_event',
    title: String(d.title ?? ''),
    description: d.description ? String(d.description) : undefined,
    startDate: formatDate(d.startDate),
    endDate: formatDate(d.endDate),
    startTime: d.startTime ? String(d.startTime) : undefined,
    endTime: d.endTime ? String(d.endTime) : undefined,
    allDay: Boolean(d.allDay),
    location: d.location ? String(d.location) : undefined,
    clientName: d.clientName ? String(d.clientName) : undefined,
    trainerName: d.trainerName ? String(d.trainerName) : undefined,
    priority: d.priority ? String(d.priority) : 'normal',
    color: d.color ? String(d.color) : undefined,
  };

  const handleSubmit = (formData: Record<string, unknown>) => {
    updateMutation.mutate(
      { id: id!, ...formData },
      {
        onSuccess: () => {
          toast.success(t('calendar.eventUpdated', 'Event updated'));
          router.back();
        },
        onError: () => {
          toast.error(t('common.errorTitle', 'Error'), t('calendar.eventUpdated', 'Could not update event'));
        },
      }
    );
  };

  return (
    <Box className="flex-1 bg-black">
      <Box className="absolute top-0 left-0 right-0 h-[300px] opacity-20">
        <LinearGradient colors={['rgba(255, 59, 48, 0.2)', 'transparent']} style={{ flex: 1 }} />
      </Box>

      <Box style={{ paddingTop: insets.top + 16 }} className="flex-1">
        <HStack className="px-4 items-center mb-4">
          <Pressable onPress={() => router.back()}>
            <ChevronLeft size={24} color="white" />
          </Pressable>
          <Text className="text-white text-lg font-bold ml-3">{t('calendar.editEvent', 'Edit Event')}</Text>
        </HStack>

        <CalendarEventForm
          mode="edit"
          initialData={initialData}
          onSubmit={handleSubmit}
          isSubmitting={updateMutation.isPending}
          submitLabel={t('calendar.saveChanges', 'Save Changes')}
        />
      </Box>
    </Box>
  );
}
