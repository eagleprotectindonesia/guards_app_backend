import React, { useEffect, useState } from 'react';
import { Alert } from 'react-native';
import { Box, Heading, Text, VStack, HStack, Pressable, Spinner } from '@gluestack-ui/themed';
import * as Location from 'expo-location';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { client } from '../api/client';
import { useTranslation } from 'react-i18next';
import { ShiftWithRelations } from '@repo/types';
import { CheckInWindowResult } from '@repo/shared';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { stopGeofencing } from '../utils/geofence';
import { AlertTriangle, Fingerprint, Clock, CheckCircle } from 'lucide-react-native';

type CheckInCardProps = {
  activeShift: ShiftWithRelations & { checkInWindow?: CheckInWindowResult };
  refetchShift: () => void;
};

export default function CheckInCard({ activeShift, refetchShift }: CheckInCardProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [timerDisplay, setTimerDisplay] = useState<string>('--');
  const [timerLabel, setTimerLabel] = useState<string>('');
  const [canCheckIn, setCanCheckIn] = useState(false);
  const [status, setStatus] = useState('');
  const [uiState, setUiState] = useState<'upcoming' | 'open' | 'urgent' | 'late'>('upcoming');

  const checkInMutation = useMutation({
    mutationFn: async (location: { lat: number; lng: number }) => {
      const response = await client.post(`/api/employee/shifts/${activeShift.id}/checkin`, {
        source: 'mobile-app',
        location,
      });
      return response.data;
    },
    onSuccess: async data => {
      const successMsg = t('checkin.success');
      setStatus(successMsg);
      queryClient.invalidateQueries({ queryKey: ['active-shift'] });
      refetchShift();

      setTimeout(() => {
        setStatus(prev => (prev === successMsg ? '' : prev));
      }, 3000);

      if (data.isLastSlot) {
        await stopGeofencing();
        Alert.alert(t('checkin.shiftCompletedTitle'), t('checkin.shiftCompletedMessage'));
      }
    },
    onError: (error: any) => {
      const msg = error.response?.data?.error || error.message || t('checkin.fail');
      setStatus('Error: ' + msg);
      if (msg.includes('Already checked in')) {
        refetchShift();
      }
    },
  });

  useEffect(() => {
    if (!activeShift?.checkInWindow) return;

    const formatTime = (seconds: number) => {
      const absSeconds = Math.abs(seconds);
      if (absSeconds > 60) {
        const mins = Math.ceil(absSeconds / 60);
        return { value: mins.toString(), label: t('common.minutes') };
      }
      return { value: absSeconds.toString(), label: t('common.seconds') };
    };

    const updateTimer = () => {
      const window = activeShift.checkInWindow;
      if (!window) return;

      const now = Date.now();
      const currentSlotStart = new Date(window.currentSlotStart).getTime();
      const currentSlotEnd = new Date(window.currentSlotEnd).getTime();
      const nextSlotStart = new Date(window.nextSlotStart || window.currentSlotStart).getTime(); // Fallback if next is null

      let newState: 'upcoming' | 'open' | 'urgent' | 'late' = 'upcoming';
      let displayValue = '--';
      let displayLabel = '';
      let isWindowOpen = false;

      if (window.status === 'completed') {
        // Waiting for next slot
        const diff = Math.ceil((nextSlotStart - now) / 1000);
        if (diff > 0) {
          newState = 'upcoming';
          const ft = formatTime(diff);
          displayValue = ft.value;
          displayLabel = ft.label;
        } else {
          // Transitioning
          displayValue = '...';
          displayLabel = t('checkin.preparingNext');
          refetchShift();
        }
      } else if (window.status === 'early') {
        // Before slot start
        const diff = Math.ceil((currentSlotStart - now) / 1000);
        if (diff > 0) {
          newState = 'upcoming';
          const ft = formatTime(diff);
          displayValue = ft.value;
          displayLabel = ft.label;
        } else {
          // It should be open now, verify validity
          if (now < currentSlotEnd) {
            newState = 'open';
            isWindowOpen = true; // Use basic open first
          } else {
            // Missed completely?
            newState = 'late';
            isWindowOpen = true;
            refetchShift();
          }
        }
      } else if (window.status === 'open') {
        const diff = Math.ceil((currentSlotEnd - now) / 1000);
        if (diff > 0) {
          const ft = formatTime(diff);
          displayValue = ft.value;
          displayLabel = ft.label;
          isWindowOpen = true;

          if (diff < 60) {
            newState = 'urgent';
          } else {
            newState = 'open';
          }
        } else {
          newState = 'late';
          isWindowOpen = true;
          refetchShift();
        }
      } else if (window.status === 'late') {
        newState = 'late';
        isWindowOpen = true;
        displayValue = '!';
        displayLabel = t('checkin.missed');
      }

      setUiState(newState);
      setTimerDisplay(displayValue);
      setTimerLabel(displayLabel);
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

  // UI Configuration based on state
  const getUIConfig = () => {
    switch (uiState) {
      case 'upcoming':
        return {
          bgColors: ['rgba(38, 38, 38, 0.5)', 'rgba(0,0,0,0)'] as const,
          glowColor: '#3B82F6', // Blue
          icon: <Clock size={24} color="#3B82F6" />,
          title: t('checkin.titleNext'),
          subtitle: t('checkin.opensIn', { time: '' }).replace('{{time}}', ''),
          textColor: '$blue400',
          btnColors: ['#3B82F6', '#1D4ED8'] as const,
          showBtn: false,
          glowStyles: { boxShadow: '0 0 20px rgba(59, 130, 246, 0.6)' },
        };
      case 'open':
        return {
          bgColors: ['rgba(22, 101, 52, 0.3)', 'rgba(0,0,0,0)'] as const,
          glowColor: '#22C55E', // Green
          icon: <CheckCircle size={24} color="#22C55E" />,
          title: t('checkin.titleOpen'),
          subtitle: t('checkin.windowClosing'),
          textColor: '$green400',
          btnColors: ['#22C55E', '#15803D'] as const,
          showBtn: true,
          glowStyles: { boxShadow: '0 0 20px rgba(34, 197, 94, 0.6)' },
        };
      case 'urgent':
        return {
          bgColors: ['rgba(180, 83, 9, 0.4)', 'rgba(0,0,0,0)'] as const,
          glowColor: '#F59E0B', // Amber
          icon: <AlertTriangle size={24} color="#F59E0B" />,
          title: t('checkin.checkpointTitle'), // "Checkpoint Authentication"
          subtitle: t('checkin.windowClosing'),
          textColor: '$amber400',
          btnColors: ['#F59E0B', '#B45309'] as const,
          showBtn: true,
          glowStyles: { boxShadow: '0 0 20px rgba(245, 158, 11, 0.6)' },
        };
      case 'late':
        return {
          bgColors: ['rgba(127, 29, 29, 0.4)', 'rgba(0,0,0,0)'] as const,
          glowColor: '#EF4444', // Red
          icon: <AlertTriangle size={24} color="#EF4444" />,
          title: t('checkin.titleLate'),
          subtitle: t('checkin.lateStatus'),
          textColor: '$red400',
          btnColors: ['#DC2626', '#991B1B'] as const,
          showBtn: true,
          glowStyles: { boxShadow: '0 0 20px rgba(239, 68, 68, 0.6)' },
        };
    }
  };

  const ui = getUIConfig();

  return (
    <Box
      rounded="$3xl"
      overflow="hidden"
      bg="$backgroundDark900"
      borderColor="$borderDark800"
      borderWidth={1}
      mb="$6"
      sx={{
        _web: {
          boxShadow: '0 20px 40px -10px rgba(0, 0, 0, 0.7)',
        },
      }}
    >
      {/* Header Section with Gradient Mesh Background */}
      <Box position="relative" overflow="hidden">
        <LinearGradient colors={ui.bgColors} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} />
        <Box p="$6" alignItems="center" borderBottomWidth={1} borderColor="rgba(255,255,255,0.05)">
          {/* Top Glow */}
          <Box
            position="absolute"
            top={0}
            w={128}
            h={4}
            bg={ui.glowColor}
            rounded="$full"
            opacity={0.6}
            sx={{
              _web: ui.glowStyles,
            }}
          />

          <Box
            w={48}
            h={48}
            bg="$backgroundDark900"
            rounded="$full"
            alignItems="center"
            justifyContent="center"
            mb="$3"
            borderColor="rgba(255,255,255,0.05)"
            borderWidth={1}
            sx={{
              _web: { boxShadow: '0 0 15px rgba(0,0,0,0.5)' },
            }}
          >
            {ui.icon}
          </Box>

          <Heading color="$white" size="md" mb="$1" textAlign="center">
            {ui.title}
          </Heading>
          <Text color="$textDark400" size="xs" fontWeight="$medium" textAlign="center">
            {ui.subtitle}
          </Text>
        </Box>
      </Box>

      {/* Content Section */}
      <Box p="$6" pt="$8">
        {uiState !== 'late' ? (
          <HStack justifyContent="center" alignItems="center" space="md" mb={ui.showBtn ? '$8' : '$2'}>
            <VStack alignItems="center">
              <Text color="$white" size="5xl" fontWeight="$light" lineHeight={48}>
                {timerDisplay}
              </Text>
              <Text
                color="$textDark500"
                size="xs"
                fontWeight="$bold"
                textTransform="uppercase"
                letterSpacing={2}
                mt="$2"
              >
                {timerLabel}
              </Text>
            </VStack>
          </HStack>
        ) : null}

        {ui.showBtn && (
          <Pressable
            onPress={canCheckIn ? handleCheckIn : undefined}
            disabled={!canCheckIn || checkInMutation.isPending}
          >
            {({ pressed }: { pressed: boolean }) => (
              <LinearGradient
                colors={ui.btnColors}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={{
                  borderRadius: 12,
                  paddingVertical: 16,
                  opacity: pressed ? 0.9 : 1,
                  transform: [{ scale: pressed ? 0.98 : 1 }],
                }}
              >
                <HStack justifyContent="center" alignItems="center" space="md">
                  {checkInMutation.isPending ? <Spinner color="$white" /> : <Fingerprint size={20} color="white" />}
                  <Text color="$white" fontWeight="$bold" textTransform="uppercase" size="sm" letterSpacing={1}>
                    {uiState === 'late' ? t('checkin.submitLateButton') : t('checkin.checkInNow')}
                  </Text>
                </HStack>
              </LinearGradient>
            )}
          </Pressable>
        )}

        {status ? (
          <Text color="$textDark400" size="xs" textAlign="center" mt="$4">
            {status}
          </Text>
        ) : null}
      </Box>
    </Box>
  );
}
