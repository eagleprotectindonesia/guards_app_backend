import { useState, useMemo, useRef, useEffect } from 'react';
import { ScrollView, StyleSheet, View, Platform } from 'react-native';
import { BlurView } from 'expo-blur';
import { Box } from '@/components/ui/box';
import { VStack } from '@/components/ui/vstack';
import { HStack } from '@/components/ui/hstack';
import { Text } from '@/components/ui/text';
import { Pressable } from '@/components/ui/pressable';
import { Input, InputField } from '@/components/ui/input';
import { FormControl, FormControlLabel, FormControlLabelText } from '@/components/ui/form-control';
import { Switch } from '@/components/ui/switch';
import { ButtonSpinner } from '@/components/ui/button';
import {
  Actionsheet,
  ActionsheetBackdrop,
  ActionsheetContent,
  ActionsheetDragIndicatorWrapper,
  ActionsheetDragIndicator,
  ActionsheetItem,
  ActionsheetItemText,
  ActionsheetScrollView,
} from '@/components/ui/actionsheet';
import { useTranslation } from 'react-i18next';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import DateTimePicker from '@react-native-community/datetimepicker';
import { CalendarEventKind } from '@repo/types';
import { createCalendarEventSchema, updateCalendarEventSchema } from '@repo/validations';
import {
  ALL_CALENDAR_EVENT_KINDS,
  KINDS_WITH_END_DATE,
  KINDS_WITH_TIME,
  KINDS_WITH_LOCATION,
  KINDS_WITH_PRIORITY,
  KIND_COLORS,
  REMINDER_PRESETS,
} from '@repo/shared';
import { UserTagPicker } from './UserTagPicker';
import type { TaggedUserResult } from '../../hooks/useCalendar';

const KIND_ICONS: Record<string, string> = {
  meeting: '📅',
  client_meeting: '🤝',
  reminder: '⏰',
  task: '✓',
  deadline: '⚠️',
  follow_up: '🔄',
  training: '🎓',
  personal_event: '👤',
  other: '📌',
};

const COLOR_PRESETS = ['#FF3B30', '#FF9500', '#FFCC00', '#34C759', '#007AFF', '#AF52DE', '#FF2D55', '#5AC8FA'];

interface CalendarEventFormProps {
  mode: 'create' | 'edit';
  initialData?: {
    kind?: CalendarEventKind;
    title?: string;
    description?: string;
    startDate?: string;
    endDate?: string;
    startTime?: string;
    endTime?: string;
    allDay?: boolean;
    location?: string;
    clientName?: string;
    trainerName?: string;
    priority?: string;
    color?: string;
    reminderMinutesBefore?: number | null;
    taggedUsers?: TaggedUserResult[];
  };
  onSubmit: (data: Record<string, unknown>) => void;
  isSubmitting: boolean;
  submitLabel: string;
}

export function CalendarEventForm({ mode, initialData, onSubmit, isSubmitting, submitLabel }: CalendarEventFormProps) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();

  const [kind, setKind] = useState<CalendarEventKind>(initialData?.kind ?? 'personal_event');
  const [title, setTitle] = useState(initialData?.title ?? '');
  const [description, setDescription] = useState(initialData?.description ?? '');
  const [startDate, setStartDate] = useState(initialData?.startDate ?? new Date().toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState(initialData?.endDate ?? new Date().toISOString().slice(0, 10));
  const [startTime, setStartTime] = useState(initialData?.startTime ?? '09:00');
  const [endTime, setEndTime] = useState(initialData?.endTime ?? '10:00');
  const [allDay, setAllDay] = useState(initialData?.allDay ?? false);
  const [location, setLocation] = useState(initialData?.location ?? '');
  const [clientName, setClientName] = useState(initialData?.clientName ?? '');
  const [trainerName, setTrainerName] = useState(initialData?.trainerName ?? '');
  const [priority, setPriority] = useState(initialData?.priority ?? 'normal');
  const [color, setColor] = useState(initialData?.color ?? KIND_COLORS[kind]);
  const [selectedTaggedUsers, setSelectedTaggedUsers] = useState<TaggedUserResult[]>(initialData?.taggedUsers ?? []);
  const [reminderMinutesBefore, setReminderMinutesBefore] = useState<number | null>(null);
  const [showReminderSheet, setShowReminderSheet] = useState(false);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});

  const prevInitialDataRef = useRef(initialData);
  useEffect(() => {
    if (initialData !== prevInitialDataRef.current) {
      prevInitialDataRef.current = initialData;
      setKind(initialData?.kind ?? 'personal_event');
      setTitle(initialData?.title ?? '');
      setDescription(initialData?.description ?? '');
      setStartDate(initialData?.startDate ?? new Date().toISOString().slice(0, 10));
      setEndDate(initialData?.endDate ?? new Date().toISOString().slice(0, 10));
      setStartTime(initialData?.startTime ?? '09:00');
      setEndTime(initialData?.endTime ?? '10:00');
      setAllDay(initialData?.allDay ?? false);
      setLocation(initialData?.location ?? '');
      setClientName(initialData?.clientName ?? '');
      setTrainerName(initialData?.trainerName ?? '');
      setPriority(initialData?.priority ?? 'normal');
      setColor(initialData?.color ?? KIND_COLORS[initialData?.kind ?? 'personal_event']);
      setSelectedTaggedUsers(initialData?.taggedUsers ?? []);
      setReminderMinutesBefore(initialData?.reminderMinutesBefore ?? null);
      setValidationErrors({});
    }
  }, [initialData]);

  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);
  const [showStartTimePicker, setShowStartTimePicker] = useState(false);
  const [showEndTimePicker, setShowEndTimePicker] = useState(false);
  const [showPrioritySheet, setShowPrioritySheet] = useState(false);

  const startDateObj = useMemo(() => new Date(startDate + 'T00:00:00'), [startDate]);
  const endDateObj = useMemo(() => new Date(endDate + 'T00:00:00'), [endDate]);

  const showEndDateField = KINDS_WITH_END_DATE.has(kind);
  const showTimeFields = !allDay && KINDS_WITH_TIME.has(kind);
  const showLocationField = KINDS_WITH_LOCATION.has(kind);
  const showPriorityField = KINDS_WITH_PRIORITY.has(kind);

  const clearFieldError = (field: string) => {
    setValidationErrors(prev => {
      const next = { ...prev };
      delete next[field];
      return next;
    });
  };

  const handleKindChange = (newKind: CalendarEventKind) => {
    setKind(newKind);
    if (!KINDS_WITH_END_DATE.has(newKind)) {
      setEndDate(startDate);
    }
    if (!color || color === KIND_COLORS[kind]) {
      setColor(KIND_COLORS[newKind]);
    }
  };

  const handleSubmit = () => {
    const data = {
      kind,
      title,
      description: description || undefined,
      startDate,
      endDate: showEndDateField ? endDate : startDate,
      startTime: showTimeFields ? startTime : undefined,
      endTime: showTimeFields ? endTime : undefined,
      allDay,
      location: showLocationField ? location || undefined : undefined,
      clientName: kind === 'client_meeting' && clientName ? clientName : undefined,
      trainerName: kind === 'training' && trainerName ? trainerName : undefined,
      priority: showPriorityField ? priority : undefined,
      color: color || undefined,
      taggedEmployeeIds: selectedTaggedUsers.filter(u => u.type === 'employee').map(u => u.id),
      taggedAdminIds: selectedTaggedUsers.filter(u => u.type === 'admin').map(u => u.id),
      reminderMinutesBefore: reminderMinutesBefore ?? null,
    } as Record<string, unknown>;

    const schema = mode === 'create' ? createCalendarEventSchema : updateCalendarEventSchema;
    const result = schema.safeParse(data);

    if (!result.success) {
      const errors: Record<string, string> = {};
      for (const issue of result.error.issues) {
        const path = issue.path.join('.');
        if (!errors[path]) {
          errors[path] = issue.message;
        }
      }
      setValidationErrors(errors);
      return;
    }

    setValidationErrors({});
    onSubmit(data);
  };

  return (
    <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 120 }} showsVerticalScrollIndicator={false}>
      <Box className="px-4">
        {/* Kind Selector */}
        <View style={styles.glassCard}>
          <BlurView intensity={20} tint="dark" style={StyleSheet.absoluteFill} />
          <VStack className="p-6" space="md">
            <Text className="text-white text-sm font-semibold uppercase tracking-wide">
              {t('calendar.kind', 'Event Type')}
            </Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <HStack space="sm">
                {ALL_CALENDAR_EVENT_KINDS.map(k => {
                  const isActive = kind === k;
                  const kindKey = `kind${k.charAt(0).toUpperCase()}${k.slice(1).replace(/_([a-z])/g, (_, c) => c.toUpperCase())}`;
                  const label = t(
                    `calendar.${kindKey}`,
                    k.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
                  );
                  return (
                    <Pressable
                      key={k}
                      onPress={() => handleKindChange(k)}
                      className="px-3.5 py-2.5 rounded-full border"
                      style={{
                        backgroundColor: isActive ? '#FF3B30' : 'transparent',
                        borderColor: isActive ? '#FF3B30' : 'rgba(255,255,255,0.1)',
                      }}
                    >
                      <Text className="text-xs font-semibold" style={{ color: isActive ? '#fff' : '#9CA3AF' }}>
                        {KIND_ICONS[k]} {label}
                      </Text>
                    </Pressable>
                  );
                })}
              </HStack>
            </ScrollView>
          </VStack>
        </View>

        {/* Title */}
        <View style={[styles.glassCard, { marginTop: 12 }]}>
          <BlurView intensity={20} tint="dark" style={StyleSheet.absoluteFill} />
          <VStack className="p-6" space="md">
            <FormControl>
              <FormControlLabel>
                <FormControlLabelText className="text-white text-sm font-semibold uppercase tracking-wide">
                  {t('calendar.event', 'Event')} *
                </FormControlLabelText>
              </FormControlLabel>
              <Input className="bg-[#2C2C2E] border-0 rounded-xl mt-2">
                <InputField
                  className="text-white"
                  placeholder="Event title"
                  placeholderTextColor="#737373"
                  value={title}
                  onChangeText={v => {
                    setTitle(v);
                    clearFieldError('title');
                  }}
                />
              </Input>
              {validationErrors.title && <Text className="text-[#FF3B30] text-xs mt-1">{validationErrors.title}</Text>}
            </FormControl>
          </VStack>
        </View>

        {/* Date & Time */}
        <View style={[styles.glassCard, { marginTop: 12 }]}>
          <BlurView intensity={20} tint="dark" style={StyleSheet.absoluteFill} />
          <VStack className="p-6" space="md">
            <HStack space="sm" className="items-center justify-between">
              <Text className="text-white text-sm font-semibold uppercase tracking-wide">
                {t('calendar.allDay', 'All day')}
              </Text>
              <Switch
                value={allDay}
                onValueChange={setAllDay}
                trackColor={{ false: '#3A3A3C', true: '#FF3B3066' }}
                thumbColor={allDay ? '#FF3B30' : '#8E8E93'}
              />
            </HStack>

            <HStack space="sm">
              <VStack className="flex-1">
                <Pressable onPress={() => setShowStartPicker(true)} className="bg-[#2C2C2E] rounded-xl p-3.5">
                  <Text className="text-[#737373] text-xs">{t('calendar.startDate', 'Start Date')}</Text>
                  <Text className="text-white text-sm mt-0.5">{startDate}</Text>
                </Pressable>
              </VStack>
              {showEndDateField && (
                <VStack className="flex-1">
                  <Pressable onPress={() => setShowEndPicker(true)} className="bg-[#2C2C2E] rounded-xl p-3.5">
                    <Text className="text-[#737373] text-xs">{t('calendar.endDate', 'End Date')}</Text>
                    <Text className="text-white text-sm mt-0.5">{endDate}</Text>
                  </Pressable>
                </VStack>
              )}
            </HStack>
            {validationErrors.startDate && <Text className="text-[#FF3B30] text-xs">{validationErrors.startDate}</Text>}
            {validationErrors.endDate && <Text className="text-[#FF3B30] text-xs">{validationErrors.endDate}</Text>}

            {showTimeFields && (
              <HStack space="sm">
                <VStack className="flex-1">
                  <Pressable onPress={() => setShowStartTimePicker(true)} className="bg-[#2C2C2E] rounded-xl p-3.5">
                    <Text className="text-[#737373] text-xs">{t('calendar.startTime', 'Start Time')}</Text>
                    <Text className="text-white text-sm mt-0.5">{startTime}</Text>
                  </Pressable>
                </VStack>
                <VStack className="flex-1">
                  <Pressable onPress={() => setShowEndTimePicker(true)} className="bg-[#2C2C2E] rounded-xl p-3.5">
                    <Text className="text-[#737373] text-xs">{t('calendar.endTime', 'End Time')}</Text>
                    <Text className="text-white text-sm mt-0.5">{endTime}</Text>
                  </Pressable>
                </VStack>
              </HStack>
            )}
            {validationErrors.startTime && <Text className="text-[#FF3B30] text-xs">{validationErrors.startTime}</Text>}
            {validationErrors.endTime && <Text className="text-[#FF3B30] text-xs">{validationErrors.endTime}</Text>}
          </VStack>
        </View>

        {/* Reminder */}
        <View style={[styles.glassCard, { marginTop: 12 }]}>
          <BlurView intensity={20} tint="dark" style={StyleSheet.absoluteFill} />
          <VStack className="p-6" space="md">
            <Text className="text-white text-sm font-semibold uppercase tracking-wide">
              {t('calendar.reminder', 'Reminder')}
            </Text>
            <Pressable onPress={() => setShowReminderSheet(true)} className="bg-[#2C2C2E] rounded-xl p-3.5">
              <Text className="text-white text-sm">
                {reminderMinutesBefore === null
                  ? t('calendar.reminderNone', 'No reminder')
                  : reminderMinutesBefore < 0
                    ? `${reminderMinutesBefore * -1} min`
                    : reminderMinutesBefore === 0
                      ? t('calendar.reminderAtEvent', 'At event time')
                      : reminderMinutesBefore < 60
                        ? t('calendar.reminderMinutesBefore', `${reminderMinutesBefore} minutes before`)
                        : reminderMinutesBefore < 1440
                          ? t('calendar.reminderHoursBefore', `${Math.round(reminderMinutesBefore / 60)} hours before`)
                          : t('calendar.reminderDaysBefore', `${Math.round(reminderMinutesBefore / 1440)} days before`)}
              </Text>
            </Pressable>
          </VStack>
        </View>

        {/* Location (conditional) */}
        {showLocationField && (
          <View style={[styles.glassCard, { marginTop: 12 }]}>
            <BlurView intensity={20} tint="dark" style={StyleSheet.absoluteFill} />
            <VStack className="p-6" space="md">
              <FormControl>
                <FormControlLabel>
                  <FormControlLabelText className="text-white text-sm font-semibold uppercase tracking-wide">
                    {t('calendar.location', 'Location')}
                  </FormControlLabelText>
                </FormControlLabel>
                <Input className="bg-[#2C2C2E] border-0 rounded-xl mt-2">
                  <InputField
                    className="text-white"
                    placeholder="Meeting room, address..."
                    placeholderTextColor="#737373"
                    value={location}
                    onChangeText={setLocation}
                  />
                </Input>
              </FormControl>
            </VStack>
          </View>
        )}

        {/* Client Name (only client_meeting) */}
        {kind === 'client_meeting' && (
          <View style={[styles.glassCard, { marginTop: 12 }]}>
            <BlurView intensity={20} tint="dark" style={StyleSheet.absoluteFill} />
            <VStack className="p-6" space="md">
              <FormControl>
                <FormControlLabel>
                  <FormControlLabelText className="text-white text-sm font-semibold uppercase tracking-wide">
                    {t('calendar.clientName', 'Client Name')}
                  </FormControlLabelText>
                </FormControlLabel>
                <Input className="bg-[#2C2C2E] border-0 rounded-xl mt-2">
                  <InputField
                    className="text-white"
                    placeholder="Client name"
                    placeholderTextColor="#737373"
                    value={clientName}
                    onChangeText={setClientName}
                  />
                </Input>
              </FormControl>
            </VStack>
          </View>
        )}

        {/* Trainer Name (only training) */}
        {kind === 'training' && (
          <View style={[styles.glassCard, { marginTop: 12 }]}>
            <BlurView intensity={20} tint="dark" style={StyleSheet.absoluteFill} />
            <VStack className="p-6" space="md">
              <FormControl>
                <FormControlLabel>
                  <FormControlLabelText className="text-white text-sm font-semibold uppercase tracking-wide">
                    {t('calendar.trainerName', 'Trainer')}
                  </FormControlLabelText>
                </FormControlLabel>
                <Input className="bg-[#2C2C2E] border-0 rounded-xl mt-2">
                  <InputField
                    className="text-white"
                    placeholder="Trainer name"
                    placeholderTextColor="#737373"
                    value={trainerName}
                    onChangeText={setTrainerName}
                  />
                </Input>
              </FormControl>
            </VStack>
          </View>
        )}

        {/* Priority (conditional) */}
        {showPriorityField && (
          <View style={[styles.glassCard, { marginTop: 12 }]}>
            <BlurView intensity={20} tint="dark" style={StyleSheet.absoluteFill} />
            <VStack className="p-6" space="md">
              <Text className="text-white text-sm font-semibold uppercase tracking-wide">
                {t('calendar.priority', 'Priority')}
              </Text>
              <Pressable onPress={() => setShowPrioritySheet(true)} className="bg-[#2C2C2E] rounded-xl p-3.5">
                <Text className="text-white text-sm">
                  {t(`calendar.priority${priority.charAt(0).toUpperCase() + priority.slice(1)}`, priority)}
                </Text>
              </Pressable>
            </VStack>
          </View>
        )}

        {/* Description */}
        <View style={[styles.glassCard, { marginTop: 12 }]}>
          <BlurView intensity={20} tint="dark" style={StyleSheet.absoluteFill} />
          <VStack className="p-6" space="md">
            <FormControl>
              <FormControlLabel>
                <FormControlLabelText className="text-white text-sm font-semibold uppercase tracking-wide">
                  {t('calendar.description', 'Description')}
                </FormControlLabelText>
              </FormControlLabel>
              <Input className="bg-[#2C2C2E] border-0 rounded-xl mt-2">
                <InputField
                  className="text-white"
                  placeholder={t('calendar.description', 'Add description...')}
                  placeholderTextColor="#737373"
                  value={description}
                  onChangeText={setDescription}
                  multiline
                  numberOfLines={3}
                  textAlignVertical="top"
                />
              </Input>
            </FormControl>
          </VStack>
        </View>

        {/* Tag Users */}
        <View style={[styles.glassCard, { marginTop: 12 }]}>
          <BlurView intensity={20} tint="dark" style={StyleSheet.absoluteFill} />
          <VStack className="p-6" space="md">
            <Text className="text-white text-sm font-semibold uppercase tracking-wide">
              {t('calendar.tagUsers', 'Tag Users')}
            </Text>
            <UserTagPicker selectedUsers={selectedTaggedUsers} onChange={setSelectedTaggedUsers} />
          </VStack>
        </View>

        {/* Color Picker */}
        <View style={[styles.glassCard, { marginTop: 12 }]}>
          <BlurView intensity={20} tint="dark" style={StyleSheet.absoluteFill} />
          <VStack className="p-6" space="md">
            <Text className="text-white text-sm font-semibold uppercase tracking-wide">
              {t('calendar.color', 'Color')}
            </Text>
            <HStack space="sm" className="flex-wrap">
              {COLOR_PRESETS.map(c => (
                <Pressable
                  key={c}
                  onPress={() => setColor(c)}
                  className="w-9 h-9 rounded-full items-center justify-center"
                  style={{
                    backgroundColor: c,
                    borderWidth: color === c ? 3 : 0,
                    borderColor: '#fff',
                  }}
                />
              ))}
            </HStack>
          </VStack>
        </View>

        {/* Submit Button */}
        <Pressable
          onPress={handleSubmit}
          disabled={isSubmitting || !title.trim()}
          className="mt-6 py-4 rounded-2xl items-center overflow-hidden"
          style={{ opacity: isSubmitting || !title.trim() ? 0.5 : 1 }}
        >
          <LinearGradient colors={['#FF3B30', '#D70015']} style={StyleSheet.absoluteFill} />
          {isSubmitting ? (
            <ButtonSpinner color="white" />
          ) : (
            <Text className="text-white text-base font-bold">{submitLabel}</Text>
          )}
        </Pressable>
      </Box>

      {/* Date Pickers */}
      {showStartPicker && (
        <DateTimePicker
          value={startDateObj}
          mode="date"
          display={Platform.OS === 'ios' ? 'inline' : 'default'}
          onChange={(_, date) => {
            if (date) {
              const val = date.toISOString().slice(0, 10);
              setStartDate(val);
              if (!showEndDateField) setEndDate(val);
            }
            clearFieldError('startDate');
            clearFieldError('endDate');
            setShowStartPicker(false);
          }}
        />
      )}
      {showEndPicker && (
        <DateTimePicker
          value={endDateObj}
          mode="date"
          display={Platform.OS === 'ios' ? 'inline' : 'default'}
          onChange={(_, date) => {
            if (date) setEndDate(date.toISOString().slice(0, 10));
            clearFieldError('startDate');
            clearFieldError('endDate');
            setShowEndPicker(false);
          }}
        />
      )}
      {showStartTimePicker && (
        <DateTimePicker
          value={new Date(`2000-01-01T${startTime}:00`)}
          mode="time"
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          onChange={(_, date) => {
            if (date) {
              setStartTime(`${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`);
            }
            clearFieldError('startTime');
            clearFieldError('endTime');
            setShowStartTimePicker(false);
          }}
        />
      )}
      {showEndTimePicker && (
        <DateTimePicker
          value={new Date(`2000-01-01T${endTime}:00`)}
          mode="time"
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          onChange={(_, date) => {
            if (date) {
              setEndTime(`${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`);
            }
            clearFieldError('startTime');
            clearFieldError('endTime');
            setShowEndTimePicker(false);
          }}
        />
      )}

      {/* Priority Actionsheet */}
      <Actionsheet isOpen={showPrioritySheet} onClose={() => setShowPrioritySheet(false)}>
        <ActionsheetBackdrop />
        <ActionsheetContent className="bg-[#1C1C1E] border-t border-white/10">
          <ActionsheetDragIndicatorWrapper>
            <ActionsheetDragIndicator className="bg-white/20" />
          </ActionsheetDragIndicatorWrapper>
          <ActionsheetScrollView>
            {['urgent', 'high', 'normal', 'low'].map(p => (
              <ActionsheetItem
                key={p}
                onPress={() => {
                  setPriority(p);
                  setShowPrioritySheet(false);
                }}
                className="border-b border-white/5"
              >
                <ActionsheetItemText className="text-white font-bold text-md">
                  {t(`calendar.priority${p.charAt(0).toUpperCase() + p.slice(1)}`, p)}
                </ActionsheetItemText>
              </ActionsheetItem>
            ))}
          </ActionsheetScrollView>
        </ActionsheetContent>
      </Actionsheet>

      {/* Reminder Actionsheet */}
      <Actionsheet isOpen={showReminderSheet} onClose={() => setShowReminderSheet(false)}>
        <ActionsheetBackdrop />
        <ActionsheetContent className="bg-[#1C1C1E] border-t border-white/10">
          <ActionsheetDragIndicatorWrapper>
            <ActionsheetDragIndicator className="bg-white/20" />
          </ActionsheetDragIndicatorWrapper>
          <ActionsheetScrollView>
            <ActionsheetItem
              onPress={() => {
                setReminderMinutesBefore(null);
                setShowReminderSheet(false);
              }}
              className="border-b border-white/5"
            >
              <ActionsheetItemText className="text-white font-bold text-md">
                {t('calendar.reminderNone', 'No reminder')}
              </ActionsheetItemText>
            </ActionsheetItem>
            {REMINDER_PRESETS.map(p => (
              <ActionsheetItem
                key={p.minutes}
                onPress={() => {
                  setReminderMinutesBefore(p.minutes);
                  setShowReminderSheet(false);
                }}
                className="border-b border-white/5"
              >
                <ActionsheetItemText className="text-white font-bold text-md">
                  {t(
                    `calendar.${p.labelKey}`,
                    p.labelKey
                      .replace('reminder', '')
                      .replace(/([A-Z])/g, ' $1')
                      .trim()
                  )}
                </ActionsheetItemText>
              </ActionsheetItem>
            ))}
          </ActionsheetScrollView>
        </ActionsheetContent>
      </Actionsheet>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  glassCard: {
    borderRadius: 24,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
    backgroundColor: 'rgba(25, 25, 27, 0.6)',
  },
});
