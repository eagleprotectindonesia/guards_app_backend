import React, { useEffect, useState } from 'react';
import { ScrollView, RefreshControl, Alert } from 'react-native';
import { Box, VStack, Heading, Text, Button, ButtonText, Spinner, Center } from '@gluestack-ui/themed';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { client, setupInterceptors } from '../api/client';
import AttendanceRecord from '../components/AttendanceRecord';
import CheckInCard from '../components/CheckInCard';
import ShiftCarousel from '../components/ShiftCarousel';
import PasswordChangeModal from '../components/PasswordChangeModal';

export default function DashboardScreen({ navigation }: any) {
  const queryClient = useQueryClient();
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);
  const [isForcePasswordChange, setIsForcePasswordChange] = useState(false);

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

  // Handle Force Password Change
  useEffect(() => {
    if (profile?.guard?.mustChangePassword) {
      setIsForcePasswordChange(true);
      setIsPasswordModalOpen(true);
    } else {
      setIsForcePasswordChange(false);
    }
  }, [profile?.guard?.mustChangePassword]);

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
              Selamat Datang, {'\n'}
              <Text className="text-blue-600">{profile?.guard?.name || 'Guard'}</Text>
             </Heading>
             {profile?.guard?.guardCode && (
                <Text className="text-gray-500 font-bold mt-1">Kode: {profile.guard.guardCode}</Text>
             )}
          </Box>

          {isLoading ? (
            <Center h={200}>
              <Spinner size="large" color="$blue600" />
            </Center>
          ) : (
            <VStack space="xl">
              <ShiftCarousel 
                activeShift={activeShift} 
                nextShifts={nextShifts} 
              />

              {activeShift && (
                <VStack space="md">
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
              )}
            </VStack>
          )}

          <VStack space="md" className="mt-8">
            <Button 
              variant="outline" 
              action="secondary" 
              onPress={() => setIsPasswordModalOpen(true)}
            >
              <ButtonText>Ubah Kata Sandi</ButtonText>
            </Button>

            <Button 
              variant="outline" 
              action="secondary" 
              className="border-red-500"
              onPress={() => Alert.alert('Keluar', 'Apakah Anda yakin?', [
                  { text: 'Batal', style: 'cancel'},
                  { text: 'Keluar', style: 'destructive', onPress: handleLogout}
              ])}
            >
              <ButtonText className="text-red-500">Keluar</ButtonText>
            </Button>
          </VStack>
        </VStack>
      </ScrollView>

      <PasswordChangeModal 
        isOpen={isPasswordModalOpen} 
        isForce={isForcePasswordChange}
        onClose={() => {
          setIsPasswordModalOpen(false);
          setIsForcePasswordChange(false);
        }} 
      />
    </Box>
  );
}
