import { useState } from 'react';
import { Box } from '@/components/ui/box';
import { HStack } from '@/components/ui/hstack';
import { Text } from '@/components/ui/text';
import { Pressable } from '@/components/ui/pressable';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';
import { CalendarEventForm } from '../../src/components/calendar/CalendarEventForm';
import { useCreateCalendarEvent } from '../../src/hooks/useCalendar';
import { useCustomToast } from '../../src/hooks/useCustomToast';

export default function CreateCalendarEventScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const toast = useCustomToast();
  const { date } = useLocalSearchParams<{ date?: string }>();
  const createMutation = useCreateCalendarEvent();

  const prefillDate = date ?? new Date().toISOString().slice(0, 10);

  const handleSubmit = (data: Record<string, unknown>) => {
    createMutation.mutate(data, {
      onSuccess: () => {
        toast.success(t('calendar.eventCreated', 'Event created'));
        router.back();
      },
      onError: () => {
        toast.error(t('common.errorTitle', 'Error'), t('calendar.eventCreated', 'Could not create event'));
      },
    });
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
          <Text className="text-white text-lg font-bold ml-3">{t('calendar.newEvent', 'New Event')}</Text>
        </HStack>

        <CalendarEventForm
          mode="create"
          initialData={{ startDate: prefillDate, endDate: prefillDate }}
          onSubmit={handleSubmit}
          isSubmitting={createMutation.isPending}
          submitLabel={t('calendar.createEvent', 'Create Event')}
        />
      </Box>
    </Box>
  );
}
