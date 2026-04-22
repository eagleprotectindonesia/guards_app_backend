import React, { useMemo, useState } from 'react';
import { ScrollView, TouchableOpacity, Platform } from 'react-native';
import { Box } from '@/components/ui/box';
import { VStack } from '@/components/ui/vstack';
import { HStack } from '@/components/ui/hstack';
import { Heading } from '@/components/ui/heading';
import { Text } from '@/components/ui/text';
import { Button, ButtonText, ButtonSpinner } from '@/components/ui/button';
import { Input, InputField, InputSlot, InputIcon } from '@/components/ui/input';
import { FormControl, FormControlLabel, FormControlLabelText } from '@/components/ui/form-control';
import { useTranslation } from 'react-i18next';
import { useRouter } from 'expo-router';
import { ChevronLeft, Calendar as CalendarIcon, Send, MessageSquare, Paperclip, X } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCreateLeaveRequest } from '../../src/hooks/useLeaveRequests';
import { format, addDays, isBefore, startOfDay } from 'date-fns';
import { id, enUS } from 'date-fns/locale';
import { LinearGradient } from 'expo-linear-gradient';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useCustomToast } from '../../src/hooks/useCustomToast';
import { useAlert } from '../../src/contexts/AlertContext';
import type { LeaveRequestReason } from '@repo/types';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { uploadToS3 } from '../../src/api/upload';

const MAX_ATTACHMENTS = 4;

type LeaveAttachment = {
  uri: string;
  name: string;
  mimeType: string;
  fileSize?: number;
};

export default function NewLeaveRequestScreen() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const toast = useCustomToast();
  const { showAlert } = useAlert();
  const createMutation = useCreateLeaveRequest();

  const [startDate, setStartDate] = useState(new Date());
  const [endDate, setEndDate] = useState(addDays(new Date(), 1));
  const [reason, setReason] = useState<LeaveRequestReason>('casual');
  const [employeeNote, setEmployeeNote] = useState('');
  const [attachments, setAttachments] = useState<LeaveAttachment[]>([]);

  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);

  const dateLocale = i18n.language === 'id' ? id : enUS;

  const reasonOptions = useMemo(
    () => [
      { value: 'sick' as const, label: t('leave.reasonType.sick', 'Sick') },
      { value: 'casual' as const, label: t('leave.reasonType.casual', 'Casual') },
      { value: 'emergency' as const, label: t('leave.reasonType.emergency', 'Emergency') },
    ],
    [t]
  );

  const onStartChange = (_event: unknown, selectedDate?: Date) => {
    setShowStartPicker(Platform.OS === 'ios');
    if (selectedDate) {
      setStartDate(selectedDate);
      if (isBefore(endDate, selectedDate)) {
        setEndDate(addDays(selectedDate, 1));
      }
    }
  };

  const onEndChange = (_event: unknown, selectedDate?: Date) => {
    setShowEndPicker(Platform.OS === 'ios');
    if (selectedDate) {
      setEndDate(selectedDate);
    }
  };

  const normalizeFileName = (name: string | null | undefined, fallbackExt: string) => {
    const base = name?.trim() || `leave-${Date.now()}.${fallbackExt}`;
    return base.includes('.') ? base : `${base}.${fallbackExt}`;
  };

  const appendAttachments = (newAttachments: LeaveAttachment[]) => {
    setAttachments(prev => [...prev, ...newAttachments].slice(0, MAX_ATTACHMENTS));
  };

  const pickImages = async () => {
    if (attachments.length >= MAX_ATTACHMENTS) {
      toast.warning(t('chat.limit_reached', 'Limit reached'), t('chat.limit_reached_desc', 'Maximum attachments reached'));
      return;
    }

    try {
      const remainingSlots = MAX_ATTACHMENTS - attachments.length;
      const imageResult = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsMultipleSelection: true,
        selectionLimit: remainingSlots,
        quality: 0.7,
      });

      const imageAttachments = imageResult.canceled
        ? []
        : imageResult.assets.map(asset => ({
            uri: asset.uri,
            name: normalizeFileName(asset.fileName, 'jpg'),
            mimeType: asset.mimeType || 'image/jpeg',
            fileSize: asset.fileSize,
          }));

      appendAttachments(imageAttachments);
    } catch (error) {
      console.error('Error picking leave image attachments:', error);
      toast.error(t('common.errorTitle'), t('leave.error.attachmentPickFailed', 'Failed to pick attachments'));
    }
  };

  const pickPdfs = async () => {
    if (attachments.length >= MAX_ATTACHMENTS) {
      toast.warning(t('chat.limit_reached', 'Limit reached'), t('chat.limit_reached_desc', 'Maximum attachments reached'));
      return;
    }

    try {
      const remainingSlots = MAX_ATTACHMENTS - attachments.length;
      const pdfResult = await DocumentPicker.getDocumentAsync({
        type: 'application/pdf',
        multiple: true,
        copyToCacheDirectory: true,
      });

      const pdfAttachments =
        pdfResult.canceled || !pdfResult.assets
          ? []
          : pdfResult.assets.map((asset: { uri: string; name?: string | null; mimeType?: string | null; size?: number | null }) => ({
              uri: asset.uri,
              name: normalizeFileName(asset.name, 'pdf'),
              mimeType: asset.mimeType || 'application/pdf',
              fileSize: asset.size ?? undefined,
            }));

      appendAttachments(pdfAttachments.slice(0, remainingSlots));
    } catch (error) {
      console.error('Error picking leave pdf attachments:', error);
      toast.error(t('common.errorTitle'), t('leave.error.attachmentPickFailed', 'Failed to pick attachments'));
    }
  };

  const pickAttachments = () => {
    if (attachments.length >= MAX_ATTACHMENTS) {
      toast.warning(t('chat.limit_reached', 'Limit reached'), t('chat.limit_reached_desc', 'Maximum attachments reached'));
      return;
    }

    const imageLabel = t('leave.attachmentType.image', 'Image');
    const pdfLabel = t('leave.attachmentType.pdf', 'PDF');
    const cancelLabel = t('common.cancel', 'Cancel');
    const title = t('leave.attachmentType.title', 'Select attachment type');

    showAlert(
      title,
      t('leave.attachmentType.message', 'Choose the file type to attach'),
      [
        { text: cancelLabel, style: 'cancel' },
        { text: imageLabel, onPress: () => void pickImages() },
        { text: pdfLabel, onPress: () => void pickPdfs() },
      ],
      { icon: 'info' }
    );
  };

  const removeAttachment = (index: number) => {
    setAttachments(prev => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async () => {
    if (isBefore(startOfDay(endDate), startOfDay(startDate))) {
      toast.error(t('common.errorTitle'), t('leave.validation.invalidRange'));
      return;
    }

    if (reason === 'sick' && attachments.length === 0) {
      toast.error(t('common.errorTitle'), t('leave.validation.attachmentRequiredForSick'));
      return;
    }

    try {
      const attachmentKeys = await Promise.all(
        attachments.map(async (asset, index) => {
          const uploaded = await uploadToS3(asset.uri, asset.name || `leave_${Date.now()}_${index}`, asset.mimeType, asset.fileSize || 0, {
            folder: 'leave-requests',
          });
          return uploaded.key;
        })
      );

      createMutation.mutate(
        {
          startDate: format(startDate, 'yyyy-MM-dd'),
          endDate: format(endDate, 'yyyy-MM-dd'),
          reason,
          employeeNote: employeeNote.trim() || undefined,
          attachments: attachmentKeys,
        },
        {
          onSuccess: () => {
            toast.success(t('common.successTitle'), t('leave.success.created'));
            router.back();
          },
          onError: () => {
            toast.error(t('common.errorTitle'), t('leave.error.createFailed'));
          },
        }
      );
    } catch (error) {
      console.error('Error uploading leave attachments:', error);
      toast.error(t('common.errorTitle'), t('leave.error.attachmentUploadFailed', 'Failed to upload attachments'));
    }
  };

  return (
    <Box className="flex-1 bg-black">
      <Box className="absolute top-0 left-0 right-0 h-[300px] opacity-20">
        <LinearGradient colors={['rgba(236, 91, 19, 0.2)', 'transparent']} style={{ flex: 1 }} />
      </Box>

      <Box style={{ paddingTop: insets.top + 10 }} className="px-6 pb-4 flex-row items-center">
        <TouchableOpacity
          onPress={() => router.back()}
          className="w-10 h-10 rounded-full bg-white/5 items-center justify-center border border-white/10 mr-4"
        >
          <ChevronLeft size={24} color="white" />
        </TouchableOpacity>
        <Heading size="xl" className="text-white font-bold">
          {t('leave.newRequest')}
        </Heading>
      </Box>

      <ScrollView className="flex-1 px-6 mt-4" contentContainerStyle={{ paddingBottom: 100 }} keyboardShouldPersistTaps="handled">
        <VStack space="xl">
          <Box className="bg-[#121212] border border-white/5 rounded-3xl p-6">
            <VStack space="lg">
              <FormControl>
                <FormControlLabel className="mb-2">
                  <FormControlLabelText className="text-[#A0A0A0] uppercase font-bold tracking-[1px]" size="xs">
                    {t('leave.startDate')}
                  </FormControlLabelText>
                </FormControlLabel>
                <TouchableOpacity
                  onPress={() => setShowStartPicker(true)}
                  className="bg-black/40 border border-white/10 h-14 rounded-2xl px-4 flex-row items-center"
                >
                  <CalendarIcon size={20} color="#34C759" className="mr-3" />
                  <Text className="text-white font-semibold">{format(startDate, 'PPPP', { locale: dateLocale })}</Text>
                </TouchableOpacity>
                {showStartPicker && (
                  <DateTimePicker
                    value={startDate}
                    mode="date"
                    display={Platform.OS === 'ios' ? 'inline' : 'default'}
                    onChange={onStartChange}
                    minimumDate={new Date()}
                    themeVariant="dark"
                  />
                )}
              </FormControl>

              <FormControl>
                <FormControlLabel className="mb-2">
                  <FormControlLabelText className="text-[#A0A0A0] uppercase font-bold tracking-[1px]" size="xs">
                    {t('leave.endDate')}
                  </FormControlLabelText>
                </FormControlLabel>
                <TouchableOpacity
                  onPress={() => setShowEndPicker(true)}
                  className="bg-black/40 border border-white/10 h-14 rounded-2xl px-4 flex-row items-center"
                >
                  <CalendarIcon size={20} color="#FF3B30" className="mr-3" />
                  <Text className="text-white font-semibold">{format(endDate, 'PPPP', { locale: dateLocale })}</Text>
                </TouchableOpacity>
                {showEndPicker && (
                  <DateTimePicker
                    value={endDate}
                    mode="date"
                    display={Platform.OS === 'ios' ? 'inline' : 'default'}
                    onChange={onEndChange}
                    minimumDate={startDate}
                    themeVariant="dark"
                  />
                )}
              </FormControl>
            </VStack>
          </Box>

          <Box className="bg-[#121212] border border-white/5 rounded-3xl p-6">
            <FormControl>
              <FormControlLabel className="mb-2">
                <FormControlLabelText className="text-[#A0A0A0] uppercase font-bold tracking-[1px]" size="xs">
                  {t('leave.reason')}
                </FormControlLabelText>
              </FormControlLabel>
              <HStack space="sm" className="flex-wrap">
                {reasonOptions.map(option => {
                  const active = option.value === reason;
                  return (
                    <TouchableOpacity
                      key={option.value}
                      onPress={() => setReason(option.value)}
                      className="px-4 py-2 rounded-full border"
                      style={{
                        borderColor: active ? '#34C759' : 'rgba(255,255,255,0.15)',
                        backgroundColor: active ? 'rgba(52,199,89,0.15)' : 'rgba(255,255,255,0.04)',
                      }}
                    >
                      <Text className="font-bold" style={{ color: active ? '#34C759' : '#A0A0A0' }}>
                        {option.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </HStack>
            </FormControl>
          </Box>

          <Box className="bg-[#121212] border border-white/5 rounded-3xl p-6">
            <FormControl>
              <FormControlLabel className="mb-2">
                <FormControlLabelText className="text-[#A0A0A0] uppercase font-bold tracking-[1px]" size="xs">
                  {t('leave.note', 'Note')}
                </FormControlLabelText>
              </FormControlLabel>
              <Input className="bg-black/40 border border-white/10 rounded-2xl min-h-[120px]">
                <HStack space="sm" className="px-2 pt-2 items-start">
                  <InputSlot className="pl-1 pt-1 self-start">
                    <InputIcon as={MessageSquare} className="text-[#666]" size="sm" />
                  </InputSlot>
                  <InputField
                    multiline
                    numberOfLines={4}
                    value={employeeNote}
                    onChangeText={setEmployeeNote}
                    placeholder={t('leave.notePlaceholder', 'Add optional note')}
                    placeholderTextColor="rgba(255,255,255,0.2)"
                    className="text-white text-md flex-1 text-left"
                    style={{ textAlignVertical: 'top', height: 100 }}
                  />
                </HStack>
              </Input>
            </FormControl>
          </Box>

          <Box className="bg-[#121212] border border-white/5 rounded-3xl p-6">
            <VStack space="md">
              <HStack className="justify-between items-center">
                <Text className="text-[#A0A0A0] uppercase font-bold tracking-[1px]" size="xs">
                  {t('leave.attachments', 'Attachments')}
                </Text>
                <TouchableOpacity onPress={pickAttachments} disabled={attachments.length >= MAX_ATTACHMENTS}>
                  <HStack space="xs" className="items-center">
                    <Paperclip size={14} color={attachments.length >= MAX_ATTACHMENTS ? '#666' : '#34C759'} />
                    <Text className="font-bold" style={{ color: attachments.length >= MAX_ATTACHMENTS ? '#666' : '#34C759' }}>
                      {t('leave.addAttachment', 'Add')}
                    </Text>
                  </HStack>
                </TouchableOpacity>
              </HStack>

              {attachments.length === 0 ? (
                <VStack space="xs">
                  <Text className="text-[#666]" size="sm">
                    {t('leave.attachmentHint', 'You can attach up to 4 files.')}
                  </Text>
                  {reason === 'sick' && (
                    <Text className="text-[#EF4444]" size="sm">
                      {t('leave.attachmentRequiredForSickHint')}
                    </Text>
                  )}
                </VStack>
              ) : (
                <VStack space="xs">
                  {attachments.map((asset, index) => (
                    <HStack
                      key={`${asset.uri}-${index}`}
                      className="justify-between items-center bg-black/40 border border-white/10 rounded-xl px-3 py-2"
                    >
                      <Text className="text-[#D1D1D1] flex-1" size="sm" numberOfLines={1}>
                        {asset.name || `attachment-${index + 1}`}
                      </Text>
                      <TouchableOpacity onPress={() => removeAttachment(index)}>
                        <X size={14} color="#EF4444" />
                      </TouchableOpacity>
                    </HStack>
                  ))}
                </VStack>
              )}
            </VStack>
          </Box>

          <Button
            size="xl"
            onPress={handleSubmit}
            isDisabled={createMutation.isPending}
            className="h-16 rounded-2xl bg-[#34C759]"
            style={{
              shadowColor: '#34C759',
              shadowOffset: { width: 0, height: 8 },
              shadowOpacity: 0.3,
              shadowRadius: 15,
              elevation: 8,
            }}
          >
            {createMutation.isPending ? (
              <ButtonSpinner color="white" />
            ) : (
              <HStack space="sm" className="items-center">
                <Send size={20} color="white" />
                <ButtonText className="text-white font-bold text-lg">{t('leave.submit')}</ButtonText>
              </HStack>
            )}
          </Button>

          <TouchableOpacity onPress={() => router.back()} disabled={createMutation.isPending} className="items-center py-2">
            <Text className="text-[#666] font-bold tracking-[1px] uppercase" size="xs">
              {t('common.cancel')}
            </Text>
          </TouchableOpacity>
        </VStack>
      </ScrollView>
    </Box>
  );
}
