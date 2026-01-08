import React, { useEffect, useState, useRef } from 'react';
import { Alert } from 'react-native';
import { Box, Button, ButtonText, Heading, Text, VStack, ButtonSpinner } from '@gluestack-ui/themed';
import * as Location from 'expo-location';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { client } from '../api/client';
import { useTranslation } from 'react-i18next';

type CheckInCardProps = {
  activeShift: any;
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
      const response = await client.post(`/api/shifts/${activeShift.id}/checkin`, {
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
          refetchShift();
        }
      } else if (window.status === 'late') {
        const diff = Math.ceil((nextSlotStart - now) / 1000);
        if (diff > 0) {
          message = t('checkin.nextIn', { time: formatTime(diff) });
        } else {
          message = t('checkin.preparingNext');
          refetchShift();
        }
      }

      setTimeLeft(message);
      setCanCheckIn(isWindowOpen);
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [activeShift, refetchShift, t]);

  const handleCheckIn = async () => {
    setStatus(t('checkin.gettingLocation'));
    let { status: permStatus } = await Location.requestForegroundPermissionsAsync();
    if (permStatus !== 'granted') {
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
    } catch (e) {
      Alert.alert('Error', t('checkin.locationError'));
    }
  };

  if (!activeShift?.checkInWindow) return null;

  return (
    <Box className="bg-white p-6 rounded-xl shadow-md border border-blue-100 mb-6">
      <VStack space="md" alignItems="center">
        {canCheckIn ? (
          <Heading size="2xl" className="text-green-600 mb-2">
            {t('checkin.titleOpen')}
          </Heading>
        ) : (
          <>
            <Text className="text-gray-500 font-medium">{t('checkin.titleNext')}</Text>
            <Heading size="3xl" className="font-mono text-blue-600">
              {new Date(
                activeShift.checkInWindow.nextSlotStart || activeShift.checkInWindow.currentSlotStart
              ).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </Heading>
          </>
        )}

        <Text className={`font-bold ${canCheckIn ? 'text-green-600' : 'text-amber-600'}`}>{timeLeft}</Text>

        {status ? <Text className="text-xs text-gray-400">{status}</Text> : null}

        {canCheckIn && (
          <Button
            size="xl"
            className="w-full bg-green-600 hover:bg-green-700 active:bg-green-800"
            onPress={handleCheckIn}
            isDisabled={checkInMutation.isPending}
          >
            {checkInMutation.isPending ? <ButtonSpinner color="white" mr="$2" /> : null}
            <ButtonText>{t('checkin.submitButton')}</ButtonText>
          </Button>
        )}
      </VStack>
    </Box>
  );
}
