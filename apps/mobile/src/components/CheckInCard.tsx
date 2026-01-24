import React, { useEffect, useState } from 'react';
import { Alert } from 'react-native';
import { Box, Button, ButtonText, Heading, Text, VStack, ButtonSpinner } from '@gluestack-ui/themed';
import * as Location from 'expo-location';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { client } from '../api/client';
import { useTranslation } from 'react-i18next';
import { ShiftWithRelations } from '@repo/types';
import { CheckInWindowResult } from '@repo/shared';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';

type CheckInCardProps = {
  activeShift: ShiftWithRelations & { checkInWindow?: CheckInWindowResult };
  refetchShift: () => void;
};

export default function CheckInCard({ activeShift, refetchShift }: CheckInCardProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [timeLeft, setTimeLeft] = useState('');
  const [canCheckIn, setCanCheckIn] = useState(false);
  const [status, setStatus] = useState('');

  const checkInMutation = useMutation({
    mutationFn: async (location: { lat: number; lng: number }) => {
      const response = await client.post(`/api/employee/shifts/${activeShift.id}/checkin`, {
        source: 'mobile-app',
        location,
      });
      return response.data;
    },
    onSuccess: data => {
      const successMsg = t('checkin.success');
      setStatus(successMsg);
      queryClient.invalidateQueries({ queryKey: ['active-shift'] });
      refetchShift();

      // Clear success indicator after 3 seconds
      setTimeout(() => {
        setStatus(prev => (prev === successMsg ? '' : prev));
      }, 3000);

      if (data.isLastSlot) {
        Alert.alert(t('checkin.shiftCompletedTitle'), t('checkin.shiftCompletedMessage'));
      }
    },
    onError: (error: any) => {
      const msg = error.response?.data?.error || error.message || t('checkin.fail');
      setStatus('Error: ' + msg);
      // If already checked in, refresh
      if (msg.includes('Already checked in')) {
        refetchShift();
      }
    },
  });

  useEffect(() => {
    if (!activeShift?.checkInWindow) return;

    const formatTime = (seconds: number) => {
      if (seconds > 60) return `${Math.ceil(seconds / 60)} ${t('common.minutes')}`;
      return `${seconds} ${t('common.seconds')}`;
    };

    const updateTimer = () => {
      const window = activeShift.checkInWindow;
      if (!window) return;

      const now = Date.now();
      const currentSlotStart = new Date(window.currentSlotStart).getTime();
      const currentSlotEnd = new Date(window.currentSlotEnd).getTime();
      const nextSlotStart = new Date(window.nextSlotStart).getTime();

      let isWindowOpen = false;
      let message = '';

      if (window.status === 'completed') {
        const diff = Math.ceil((nextSlotStart - now) / 1000);
        if (diff > 0) {
          message = t('checkin.nextIn', { time: formatTime(diff) });
        } else {
          message = t('checkin.preparingNext');
          refetchShift();
        }
      } else if (window.status === 'early') {
        const diff = Math.ceil((currentSlotStart - now) / 1000);
        if (diff > 0) {
          message = t('checkin.opensIn', { time: formatTime(diff) });
        } else {
          // Check if passed end time
          if (now < currentSlotEnd) {
            message = t('checkin.openStatus');
            isWindowOpen = true;
          } else {
            message = t('checkin.missed');
            isWindowOpen = true;
            // Trigger refresh if we just missed it
            refetchShift();
          }
        }
      } else if (window.status === 'open') {
        const diff = Math.ceil((currentSlotEnd - now) / 1000);
        if (diff > 0) {
          message = t('checkin.remainingTime', { time: diff });
          isWindowOpen = true;
        } else {
          message = t('checkin.missed');
          isWindowOpen = true;
          refetchShift();
        }
      } else if (window.status === 'late') {
        message = t('checkin.missed');
        isWindowOpen = true;
      }

      setTimeLeft(message);
      setCanCheckIn(isWindowOpen);
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [activeShift, refetchShift, t]);

  const handleCheckIn = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setStatus(t('checkin.gettingLocation'));
    let { status: permStatus } = await Location.requestForegroundPermissionsAsync();
    if (permStatus !== 'granted') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert(t('attendance.permissionDeniedTitle'), t('checkin.locationRequired'));
      return;
    }

    try {
      const location = await Location.getCurrentPositionAsync({});
      setStatus(t('checkin.processing'));
      checkInMutation.mutate({
        lat: location.coords.latitude,
        lng: location.coords.longitude,
      });
    } catch {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert('Error', t('checkin.locationError'));
    }
  };

  if (!activeShift?.checkInWindow || !activeShift?.attendance) return null;

  const isLate =
    activeShift.checkInWindow.status === 'late' ||
    (activeShift.checkInWindow.status === 'open' && timeLeft === t('checkin.missed'));

  const cardContent = (
    <VStack space="md" alignItems="center">
      {canCheckIn ? (
        <Heading size="2xl" color={isLate ? '$amber700' : '$green700'} mb="$2" textAlign="center">
          {isLate ? t('checkin.titleLate', { defaultValue: 'Late Check-in' }) : t('checkin.titleOpen')}
        </Heading>
      ) : (
        <>
          <Text color="$textLight500" fontWeight="$medium">{t('checkin.titleNext')}</Text>
          <Heading size="3xl" fontFamily="$mono" color="$blue600">
            {new Date(
              activeShift.checkInWindow.nextSlotStart || activeShift.checkInWindow.currentSlotStart
            ).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </Heading>
        </>
      )}

      <Text fontWeight="$bold" size="lg" color={canCheckIn && !isLate ? '$green700' : isLate ? '$amber700' : '$blue600'}>
        {timeLeft}
      </Text>

      {status ? <Text size="xs" color="$textLight500" fontWeight="$medium">{status}</Text> : null}

      {canCheckIn && (
        <Button
          size="xl"
          bg={isLate ? '$amber600' : '$green600'}
          onPress={handleCheckIn}
          isDisabled={checkInMutation.isPending}
          sx={{
            _shadow: {
              shadowColor: isLate ? '#D97706' : '#059669',
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.3,
              shadowRadius: 8,
              elevation: 5,
            }
          }}
        >
          {checkInMutation.isPending ? <ButtonSpinner color="white" mr="$2" /> : null}
          <ButtonText fontWeight="$bold">
            {isLate
              ? t('checkin.submitLateButton', { defaultValue: 'Submit Late Check-in' })
              : t('checkin.submitButton')}
          </ButtonText>
        </Button>
      )}
    </VStack>
  );

  return (
    <Box 
      mb="$6" rounded="$2xl" overflow="hidden"
      sx={{
        _shadow: {
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.1,
          shadowRadius: 10,
          elevation: 4,
        }
      }}
    >
      {canCheckIn && !isLate ? (
        <LinearGradient
          colors={['#F0FDF4', '#DCFCE7']}
          style={{ padding: 24, borderTopWidth: 4, borderTopColor: '#22C55E' }}
        >
          {cardContent}
        </LinearGradient>
      ) : isLate ? (
        <LinearGradient
          colors={['#FFFBEB', '#FEF3C7']}
          style={{ padding: 24, borderTopWidth: 4, borderTopColor: '#F59E0B' }}
        >
          {cardContent}
        </LinearGradient>
      ) : (
        <Box bg="$white" p="$6" borderWidth={1} borderColor="$blue50">
          {cardContent}
        </Box>
      )}
    </Box>
  );
}
