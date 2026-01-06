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
      setStatus('Kehadiran Berhasil Direkam!');
      queryClient.invalidateQueries({ queryKey: ['active-shift'] });
      if (onAttendanceRecorded) onAttendanceRecorded();
    },
    onError: (error: any) => {
      const msg = error.response?.data?.error || error.message || 'Gagal merekam kehadiran';
      setStatus('Gagal: ' + msg);
      Alert.alert('Error', msg);
    },
  });

  const handleRecordAttendance = async () => {
    setStatus('Meminta izin lokasi...');
    let { status: permStatus } = await Location.requestForegroundPermissionsAsync();
    
    if (permStatus !== 'granted') {
      setStatus('Izin untuk mengakses lokasi ditolak');
      Alert.alert('Izin Ditolak', 'Lokasi diperlukan untuk merekam kehadiran.');
      return;
    }

    setStatus('Mendapatkan lokasi...');
    try {
      let location = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      
      setStatus('Merekam kehadiran...');
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
        <Heading size="md" className="mb-2 text-green-600">Kehadiran Terekam</Heading>
        <Text>
          Direkam pada: {format(new Date(shift.attendance.recordedAt), 'PPpp')}
        </Text>
      </Box>
    );
  }

  return (
    <Box className="bg-white p-4 rounded-lg shadow-sm border border-red-100 mb-4">
      <VStack space="md">
        <Heading size="md" className="text-gray-900">Kehadiran Diperlukan</Heading>
        <Text className="text-gray-500">
          Harap rekam kehadiran Anda untuk memulai shift.
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
          <ButtonText>Rekam Kehadiran</ButtonText>
        </Button>
      </VStack>
    </Box>
  );
}
