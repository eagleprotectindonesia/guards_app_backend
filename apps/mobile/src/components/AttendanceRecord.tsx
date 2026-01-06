import React, { useState } from 'react';
import { Alert } from 'react-native';
import { Box, Button, ButtonText, Heading, Text, VStack, ButtonSpinner, Card } from '@gluestack-ui/themed';
import * as Location from 'expo-location';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { client } from '../api/client';

type AttendanceRecordProps = {
  shift: any; // Type should be imported from shared types if possible
  onAttendanceRecorded?: () => void;
};

export default function AttendanceRecord({ shift, onAttendanceRecorded }: AttendanceRecordProps) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<string>('');

  const attendanceMutation = useMutation({
    mutationFn: async (location: { lat: number; lng: number }) => {
      const response = await client.post(`/api/shifts/${shift.id}/attendance`, {
        shiftId: shift.id,
        location,
      });
      return response.data;
    },
    onSuccess: () => {
      setStatus('Attendance Recorded!');
      queryClient.invalidateQueries({ queryKey: ['active-shift'] });
      if (onAttendanceRecorded) onAttendanceRecorded();
    },
    onError: (error: any) => {
      const msg = error.response?.data?.error || error.message || 'Failed to record attendance';
      setStatus('Failed: ' + msg);
      Alert.alert('Error', msg);
    },
  });

  const handleRecordAttendance = async () => {
    setStatus('Requesting location permission...');
    let { status: permStatus } = await Location.requestForegroundPermissionsAsync();
    
    if (permStatus !== 'granted') {
      setStatus('Permission to access location was denied');
      Alert.alert('Permission Denied', 'Location is required to record attendance.');
      return;
    }

    setStatus('Getting location...');
    try {
      let location = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      
      setStatus('Recording attendance...');
      attendanceMutation.mutate({
        lat: location.coords.latitude,
        lng: location.coords.longitude,
      });
    } catch (err) {
      console.error(err);
      setStatus('Failed to get location');
      Alert.alert('Location Error', 'Could not fetch current location.');
    }
  };

  const hasAttendance = !!shift.attendance;
  // Use a simple check for lateness for now, can be enhanced
  const isLate = false; 

  if (hasAttendance) {
    return (
      <Box className="bg-white p-4 rounded-lg shadow-sm border border-gray-200 mb-4">
        <Heading size="md" className="mb-2 text-green-600">Attendance Recorded</Heading>
        <Text>
          Recorded at: {format(new Date(shift.attendance.recordedAt), 'PPpp')}
        </Text>
      </Box>
    );
  }

  return (
    <Box className="bg-white p-4 rounded-lg shadow-sm border border-red-100 mb-4">
      <VStack space="md">
        <Heading size="md" className="text-gray-900">Attendance Required</Heading>
        <Text className="text-gray-500">
          Please record your attendance to start the shift.
        </Text>
        
        {status ? <Text className="text-sm text-blue-600 font-medium">{status}</Text> : null}

        <Button
          size="lg"
          variant="solid"
          action="primary"
          onPress={handleRecordAttendance}
          isDisabled={attendanceMutation.isPending}
        >
          {attendanceMutation.isPending ? <ButtonSpinner mr="$2" color="white" /> : null}
          <ButtonText>Record Attendance</ButtonText>
        </Button>
      </VStack>
    </Box>
  );
}
