import React, { useEffect, useState, useRef } from 'react';
import { Alert } from 'react-native';
import { Box, Button, ButtonText, Heading, Text, VStack, ButtonSpinner } from '@gluestack-ui/themed';
import * as Location from 'expo-location';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { client } from '../api/client';

type CheckInCardProps = {
  activeShift: any;
  refetchShift: () => void;
};

export default function CheckInCard({ activeShift, refetchShift }: CheckInCardProps) {
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
    onSuccess: (data) => {
      setStatus('Check-in Successful!');
      queryClient.invalidateQueries({ queryKey: ['active-shift'] });
      refetchShift();
      if (data.isLastSlot) {
        Alert.alert('Shift Completed', 'You have completed your shift!');
      }
    },
    onError: (error: any) => {
      const msg = error.response?.data?.error || error.message || 'Check-in failed';
      setStatus('Error: ' + msg);
      // If already checked in, refresh
      if (msg.includes('Already checked in')) {
        refetchShift();
      }
    },
  });

  useEffect(() => {
    if (!activeShift?.checkInWindow) return;

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
         message = diff > 0 ? `Next Check-in in ${Math.ceil(diff / 60)}m` : 'Preparing next slot...';
      } else if (window.status === 'early') {
        const diff = Math.ceil((currentSlotStart - now) / 1000);
        if (diff > 0) {
            message = `Check-in opens in ${Math.ceil(diff/60)}m`;
        } else {
            // Check if passed end time
            if (now < currentSlotEnd) {
                 message = 'Check-in OPEN';
                 isWindowOpen = true;
            } else {
                message = 'Window missed';
                // Trigger refresh if we just missed it
                refetchShift();
            }
        }
      } else if (window.status === 'open') {
        const diff = Math.ceil((currentSlotEnd - now) / 1000);
        if (diff > 0) {
            message = `Closing in ${diff}s`;
            isWindowOpen = true;
        } else {
            message = 'Window missed';
            refetchShift();
        }
      } else if (window.status === 'late') {
         const diff = Math.ceil((nextSlotStart - now) / 1000);
         message = diff > 0 ? `Next Check-in in ${Math.ceil(diff / 60)}m` : 'Preparing next slot...';
      }

      setTimeLeft(message);
      setCanCheckIn(isWindowOpen);
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [activeShift, refetchShift]);

  const handleCheckIn = async () => {
    setStatus('Getting location...');
    let { status: permStatus } = await Location.requestForegroundPermissionsAsync();
    if (permStatus !== 'granted') {
      Alert.alert('Permission Denied', 'Location is required.');
      return;
    }

    try {
      const location = await Location.getCurrentPositionAsync({});
      setStatus('Checking in...');
      checkInMutation.mutate({
        lat: location.coords.latitude,
        lng: location.coords.longitude,
      });
    } catch (e) {
      Alert.alert('Error', 'Failed to get location');
    }
  };

  if (!activeShift?.checkInWindow) return null;

  return (
    <Box className="bg-white p-6 rounded-xl shadow-md border border-blue-100 mb-6">
      <VStack space="md" alignItems="center">
        <Text className="text-gray-500 font-medium">Next Check-in</Text>
        <Heading size="3xl" className="font-mono text-blue-600">
          {new Date(activeShift.checkInWindow.nextSlotStart || activeShift.checkInWindow.currentSlotStart).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit'})}
        </Heading>
        
        <Text className={`font-bold ${canCheckIn ? 'text-green-600' : 'text-amber-600'}`}>
            {timeLeft}
        </Text>

        {status ? <Text className="text-xs text-gray-400">{status}</Text> : null}

        {canCheckIn && (
            <Button 
                size="xl" 
                className="w-full bg-green-600 hover:bg-green-700 active:bg-green-800"
                onPress={handleCheckIn}
                isDisabled={checkInMutation.isPending}
            >
                {checkInMutation.isPending ? <ButtonSpinner color="white" mr="$2"/> : null}
                <ButtonText>CHECK IN NOW</ButtonText>
            </Button>
        )}
      </VStack>
    </Box>
  );
}
