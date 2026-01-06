import React, { useEffect } from 'react';
import { ScrollView, RefreshControl, Alert } from 'react-native';
import { Box, VStack, Heading, Text, Button, ButtonText, Spinner, Center } from '@gluestack-ui/themed';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { client, setupInterceptors } from '../api/client';
import AttendanceRecord from '../components/AttendanceRecord';
import CheckInCard from '../components/CheckInCard';

export default function DashboardScreen({ navigation }: any) {
  const queryClient = useQueryClient();

  // Setup Global Logout Interceptor once
  useEffect(() => {
    setupInterceptors(() => {
      navigation.replace('Login');
    });
  }, [navigation]);

  const { data: profile } = useQuery({
    queryKey: ['profile'],
    queryFn: async () => {
      const res = await client.get('/api/my/profile');
      return res.data;
    },
  });

  const { data: shiftData, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['active-shift'],
    queryFn: async () => {
      const res = await client.get('/api/my/active-shift');
      return res.data;
    },
    refetchInterval: 30000, // Poll every 30s
  });

  const handleLogout = async () => {
    try {
      await client.post('/api/auth/guard/logout');
      navigation.replace('Login');
    } catch (e) {
      navigation.replace('Login');
    }
  };

  const activeShift = shiftData?.activeShift;
  const nextShifts = shiftData?.nextShifts || [];

  return (
    <Box className="flex-1 bg-gray-50">
      <ScrollView
        contentContainerStyle={{ padding: 20, paddingBottom: 100 }}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} />}
      >
        <VStack space="xl">
          <Box className="mt-8 mb-4">
             <Heading size="3xl" className="text-gray-900 leading-tight">
              Welcome, {'\n'}
              <Text className="text-blue-600">{profile?.guard?.name || 'Guard'}</Text>
             </Heading>
             {profile?.guard?.guardCode && (
                <Text className="text-gray-500 font-bold mt-1">Code: {profile.guard.guardCode}</Text>
             )}
          </Box>

          {isLoading ? (
            <Center h={200}>
              <Spinner size="large" color="$blue600" />
            </Center>
          ) : activeShift ? (
            <VStack space="md">
              <Box className="bg-white p-4 rounded-lg border border-blue-50">
                <Text className="text-gray-500 text-sm font-semibold uppercase tracking-wider">Current Shift</Text>
                <Heading size="md" className="mt-1">{activeShift.location?.name || 'Unknown Location'}</Heading>
                 <Text className="text-gray-600 mt-1">
                  {new Date(activeShift.startsAt).toLocaleString()} - {new Date(activeShift.endsAt).toLocaleString()}
                </Text>
              </Box>

              <AttendanceRecord 
                shift={activeShift} 
                onAttendanceRecorded={refetch}
              />
              
              {/* Show CheckInCard if attendance is recorded OR late */}
              {(activeShift.attendance || (activeShift.attendanceStatus === 'late')) && (
                <CheckInCard 
                    activeShift={activeShift} 
                    refetchShift={refetch}
                />
              )}
            </VStack>
          ) : (
            <Box className="bg-white p-8 rounded-lg border-2 border-dashed border-gray-300 items-center">
              <Text className="text-gray-500 text-center font-medium">No active shift right now.</Text>
            </Box>
          )}

          {nextShifts.length > 0 && (
             <Box className="mt-4">
                <Heading size="sm" className="mb-2 text-gray-500">Upcoming Shifts</Heading>
                {nextShifts.map((shift: any) => (
                    <Box key={shift.id} className="bg-white p-3 rounded-md mb-2 shadow-sm">
                         <Text className="font-bold">{shift.location?.name}</Text>
                         <Text className="text-xs text-gray-500">
                             {new Date(shift.startsAt).toLocaleString()}
                         </Text>
                    </Box>
                ))}
             </Box>
          )}

          <Button 
            variant="outline" 
            action="secondary" 
            className="mt-8 border-red-500"
            onPress={() => Alert.alert('Logout', 'Are you sure?', [
                { text: 'Cancel', style: 'cancel'},
                { text: 'Logout', style: 'destructive', onPress: handleLogout}
            ])}
          >
            <ButtonText className="text-red-500">Logout</ButtonText>
          </Button>
        </VStack>
      </ScrollView>
    </Box>
  );
}
