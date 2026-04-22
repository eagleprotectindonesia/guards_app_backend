import React, { useState } from 'react';
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
import { ChevronLeft, Calendar as CalendarIcon, Send, MessageSquare } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCreateLeaveRequest } from '../../src/hooks/useLeaveRequests';
import { format, addDays, isBefore, startOfDay } from 'date-fns';
import { id, enUS } from 'date-fns/locale';
import { LinearGradient } from 'expo-linear-gradient';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useCustomToast } from '../../src/hooks/useCustomToast';

export default function NewLeaveRequestScreen() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const toast = useCustomToast();
  const createMutation = useCreateLeaveRequest();

  const [startDate, setStartDate] = useState(new Date());
  const [endDate, setEndDate] = useState(addDays(new Date(), 1));
  const [reason, setReason] = useState('');
  
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);

  const dateLocale = i18n.language === 'id' ? id : enUS;

  const onStartChange = (event: any, selectedDate?: Date) => {
    setShowStartPicker(Platform.OS === 'ios');
    if (selectedDate) {
      setStartDate(selectedDate);
      if (isBefore(endDate, selectedDate)) {
        setEndDate(addDays(selectedDate, 1));
      }
    }
  };

  const onEndChange = (event: any, selectedDate?: Date) => {
    setShowEndPicker(Platform.OS === 'ios');
    if (selectedDate) {
      setEndDate(selectedDate);
    }
  };

  const handleSubmit = () => {
    if (isBefore(startOfDay(endDate), startOfDay(startDate))) {
      toast.error(t('common.errorTitle'), t('leave.validation.invalidRange'));
      return;
    }

    createMutation.mutate(
      {
        startDate: format(startDate, 'yyyy-MM-dd'),
        endDate: format(endDate, 'yyyy-MM-dd'),
        reason: reason.trim() || undefined,
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
  };

  return (
    <Box className="flex-1 bg-black">
      {/* Background Ambient Glow */}
      <Box className="absolute top-0 left-0 right-0 h-[300px] opacity-20">
        <LinearGradient
          colors={['rgba(236, 91, 19, 0.2)', 'transparent']}
          style={{ flex: 1 }}
        />
      </Box>

      {/* Header */}
      <Box 
        style={{ paddingTop: insets.top + 10 }} 
        className="px-6 pb-4 flex-row items-center"
      >
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

      <ScrollView 
        className="flex-1 px-6 mt-4"
        contentContainerStyle={{ paddingBottom: 100 }}
        keyboardShouldPersistTaps="handled"
      >
        <VStack space="xl">
          {/* Date Selection Section */}
          <Box className="bg-[#121212] border border-white/5 rounded-3xl p-6">
            <VStack space="lg">
              {/* Start Date */}
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
                  <Text className="text-white font-semibold">
                    {format(startDate, 'PPPP', { locale: dateLocale })}
                  </Text>
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

              {/* End Date */}
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
                  <Text className="text-white font-semibold">
                    {format(endDate, 'PPPP', { locale: dateLocale })}
                  </Text>
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

          {/* Reason Section */}
          <Box className="bg-[#121212] border border-white/5 rounded-3xl p-6">
            <FormControl>
              <FormControlLabel className="mb-2">
                <FormControlLabelText className="text-[#A0A0A0] uppercase font-bold tracking-[1px]" size="xs">
                  {t('leave.reason')}
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
                    value={reason}
                    onChangeText={setReason}
                    placeholder={t('leave.reasonPlaceholder')}
                    placeholderTextColor="rgba(255,255,255,0.2)"
                    className="text-white text-md flex-1 text-left"
                    style={{ textAlignVertical: 'top', height: 100 }}
                  />
                </HStack>
              </Input>
            </FormControl>
          </Box>

          {/* Submit Button */}
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
                <ButtonText className="text-white font-bold text-lg">
                  {t('leave.submit')}
                </ButtonText>
              </HStack>
            )}
          </Button>
          
          <TouchableOpacity 
            onPress={() => router.back()}
            disabled={createMutation.isPending}
            className="items-center py-2"
          >
            <Text className="text-[#666] font-bold tracking-[1px] uppercase" size="xs">
              {t('common.cancel')}
            </Text>
          </TouchableOpacity>
        </VStack>
      </ScrollView>
    </Box>
  );
}
