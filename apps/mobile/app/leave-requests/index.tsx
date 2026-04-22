import React from 'react';
import { ScrollView, RefreshControl, TouchableOpacity } from 'react-native';
import { Box } from '@/components/ui/box';
import { VStack } from '@/components/ui/vstack';
import { HStack } from '@/components/ui/hstack';
import { Heading } from '@/components/ui/heading';
import { Text } from '@/components/ui/text';
import { Button, ButtonText } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { Center } from '@/components/ui/center';
import { useTranslation } from 'react-i18next';
import { useRouter } from 'expo-router';
import { ChevronLeft, Plus, Calendar, Clock, AlertCircle, CheckCircle2, XCircle } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useMyLeaveRequests, useCancelLeaveRequest } from '../../src/hooks/useLeaveRequests';
import { format } from 'date-fns';
import { id, enUS } from 'date-fns/locale';
import { LinearGradient } from 'expo-linear-gradient';
import { LeaveRequestStatus } from '@repo/types';
import { useAlert } from '../../src/contexts/AlertContext';
import { useCustomToast } from '../../src/hooks/useCustomToast';

export default function LeaveRequestsScreen() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { showAlert } = useAlert();
  const toast = useCustomToast();
  const { data: requests, isLoading, refetch, isRefetching } = useMyLeaveRequests();
  const cancelMutation = useCancelLeaveRequest();

  const dateLocale = i18n.language === 'id' ? id : enUS;

  const getStatusConfig = (status: LeaveRequestStatus) => {
    switch (status) {
      case 'approved':
        return {
          color: '#22C55E',
          bgColor: 'rgba(34, 197, 94, 0.1)',
          icon: CheckCircle2,
          label: t('leave.status.approved'),
        };
      case 'rejected':
        return {
          color: '#EF4444',
          bgColor: 'rgba(239, 68, 68, 0.1)',
          icon: XCircle,
          label: t('leave.status.rejected'),
        };
      case 'cancelled':
        return {
          color: '#737373',
          bgColor: 'rgba(115, 115, 115, 0.1)',
          icon: Clock,
          label: t('leave.status.cancelled'),
        };
      case 'pending':
      default:
        return {
          color: '#EAB308',
          bgColor: 'rgba(234, 179, 8, 0.1)',
          icon: AlertCircle,
          label: t('leave.status.pending'),
        };
    }
  };

  const handleCancel = (id: string) => {
    showAlert(
      t('leave.cancel'),
      t('leave.cancelConfirm', 'Are you sure you want to cancel this request?'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.confirm'),
          style: 'destructive',
          onPress: () => {
            cancelMutation.mutate(id, {
              onSuccess: () => {
                toast.success(t('common.successTitle'), t('leave.success.cancelled'));
              },
              onError: () => {
                toast.error(t('common.errorTitle'), t('leave.error.cancelFailed'));
              },
            });
          },
        },
      ],
      { icon: 'warning' }
    );
  };

  return (
    <Box className="flex-1 bg-black">
      {/* Background Ambient Glow */}
      <Box className="absolute top-0 left-0 right-0 h-[300px] opacity-20">
        <LinearGradient
          colors={['rgba(52, 199, 89, 0.2)', 'transparent']}
          style={{ flex: 1 }}
        />
      </Box>

      {/* Header */}
      <Box 
        style={{ paddingTop: insets.top + 10 }} 
        className="px-6 pb-4 flex-row items-center justify-between"
      >
        <HStack space="md" className="items-center">
          <TouchableOpacity 
            onPress={() => router.back()} 
            className="w-10 h-10 rounded-full bg-white/5 items-center justify-center border border-white/10"
          >
            <ChevronLeft size={24} color="white" />
          </TouchableOpacity>
          <Heading size="xl" className="text-white font-bold">
            {t('leave.title')}
          </Heading>
        </HStack>
        
        <TouchableOpacity 
          onPress={() => router.push('/leave-requests/new')}
          className="w-10 h-10 rounded-full bg-[#34C759] items-center justify-center"
          style={{
            shadowColor: '#34C759',
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.3,
            shadowRadius: 8,
            elevation: 5,
          }}
        >
          <Plus size={24} color="white" />
        </TouchableOpacity>
      </Box>

      <ScrollView
        contentContainerStyle={{ paddingBottom: 40, paddingHorizontal: 20 }}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={refetch}
            tintColor="#34C759"
          />
        }
      >
        {isLoading ? (
          <Center className="py-20">
            <Spinner size="large" color="#34C759" />
          </Center>
        ) : !requests || requests.length === 0 ? (
          <Center className="py-20 px-10">
            <Box className="w-20 h-20 rounded-full bg-white/5 items-center justify-center mb-4 border border-white/5">
              <Calendar size={40} color="#333" />
            </Box>
            <Text className="text-center text-[#666] font-medium">
              {t('leave.noRequests')}
            </Text>
            <Button 
              action="primary" 
              className="mt-6 bg-[#34C759] h-12 rounded-xl px-6"
              onPress={() => router.push('/leave-requests/new')}
            >
              <ButtonText className="font-bold">{t('leave.requestLeave')}</ButtonText>
            </Button>
          </Center>
        ) : (
          <VStack space="md" className="mt-4">
            {requests.map((request) => {
              const config = getStatusConfig(request.status);
              const StatusIcon = config.icon;
              
              return (
                <Box 
                  key={request.id}
                  className="bg-[#121212] border border-white/5 rounded-3xl p-5 overflow-hidden"
                >
                  <HStack className="justify-between items-start mb-4">
                    <VStack space="xs">
                      <HStack space="xs" className="items-center">
                        <Calendar size={14} color="#A0A0A0" />
                        <Text className="text-[#A0A0A0] font-bold uppercase tracking-[1px]" size="2xs">
                          {t('leave.startDate')}
                        </Text>
                      </HStack>
                      <Text className="text-white font-bold" size="md">
                        {format(new Date(request.startDate), 'dd MMM yyyy', { locale: dateLocale })}
                      </Text>
                    </VStack>
                    <VStack space="xs" className="items-end">
                      <HStack space="xs" className="items-center">
                        <Text className="text-[#A0A0A0] font-bold uppercase tracking-[1px]" size="2xs">
                          {t('leave.endDate')}
                        </Text>
                        <Calendar size={14} color="#A0A0A0" />
                      </HStack>
                      <Text className="text-white font-bold" size="md">
                        {format(new Date(request.endDate), 'dd MMM yyyy', { locale: dateLocale })}
                      </Text>
                    </VStack>
                  </HStack>

                  <Box className="h-[1px] bg-white/5 w-full mb-4" />

                  {request.reason && (
                    <VStack space="xs" className="mb-4">
                      <Text className="text-[#666] font-bold uppercase tracking-[1px]" size="2xs">
                        {t('leave.reason')}
                      </Text>
                      <Text className="text-[#D1D1D1]" size="sm">
                        {request.reason}
                      </Text>
                    </VStack>
                  )}

                  <HStack className="justify-between items-center">
                    <Box 
                      style={{ backgroundColor: config.bgColor }}
                      className="flex-row items-center px-3 py-1.5 rounded-full border border-white/5"
                    >
                      <StatusIcon size={14} color={config.color} className="mr-1.5" />
                      <Text style={{ color: config.color }} className="font-bold uppercase tracking-[0.5px]" size="2xs">
                        {config.label}
                      </Text>
                    </Box>

                    {request.status === 'pending' && (
                      <TouchableOpacity 
                        onPress={() => handleCancel(request.id)}
                        disabled={cancelMutation.isPending}
                      >
                        <Text className="text-[#EF4444] font-bold" size="xs">
                          {t('leave.cancel')}
                        </Text>
                      </TouchableOpacity>
                    )}
                  </HStack>

                  {request.reviewNote && (
                    <Box className="mt-4 p-3 rounded-2xl bg-white/5 border border-white/5">
                      <Text className="text-[#666] font-bold uppercase tracking-[1px] mb-1" size="2xs">
                        Admin Note
                      </Text>
                      <Text className="text-[#A0A0A0] italic" size="xs">
                        "{request.reviewNote}"
                      </Text>
                    </Box>
                  )}
                </Box>
              );
            })}
          </VStack>
        )}
      </ScrollView>
    </Box>
  );
}
