import React, { useState } from 'react';
import { ScrollView, RefreshControl, TouchableOpacity, StyleSheet } from 'react-native';
import { Box } from '@/components/ui/box';
import { VStack } from '@/components/ui/vstack';
import { HStack } from '@/components/ui/hstack';
import { Heading } from '@/components/ui/heading';
import { Text } from '@/components/ui/text';
import { Spinner } from '@/components/ui/spinner';
import { Center } from '@/components/ui/center';
import { useTranslation } from 'react-i18next';
import { useRouter } from 'expo-router';
import {
  ChevronLeft,
  Calendar,
  ChevronDown,
  ChevronUp,
  Tag,
  Clock,
  User,
  MapPin,
  Phone,
  AlertCircle,
  MessageSquare,
} from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useMyTickets } from '../../src/hooks/useTickets';
import { RichTextViewer } from '../../src/components/RichTextViewer';
import { format } from 'date-fns';
import { id, enUS } from 'date-fns/locale';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { TicketPriority, TicketStatus } from '@repo/types';

const PRIMARY_RED = '#FF3B30';

export default function TicketsScreen() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { data, isLoading, refetch, isRefetching } = useMyTickets();
  const tickets = data?.items ?? [];
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const dateLocale = i18n.language === 'id' ? id : enUS;

  const getPriorityConfig = (priority: TicketPriority) => {
    switch (priority) {
      case 'CRITICAL':
        return {
          color: '#FF3B30',
          bgColor: 'rgba(255, 59, 48, 0.1)',
          label: t('tickets.priorityLabel.CRITICAL', 'Critical'),
        };
      case 'HIGH':
        return { color: '#FF9500', bgColor: 'rgba(255, 149, 0, 0.1)', label: t('tickets.priorityLabel.HIGH', 'High') };
      case 'LOW':
        return { color: '#30B0C7', bgColor: 'rgba(48, 176, 199, 0.1)', label: t('tickets.priorityLabel.LOW', 'Low') };
      case 'MEDIUM':
      default:
        return {
          color: '#007AFF',
          bgColor: 'rgba(0, 122, 255, 0.1)',
          label: t('tickets.priorityLabel.MEDIUM', 'Medium'),
        };
    }
  };

  const getStatusConfig = (status: TicketStatus) => {
    switch (status) {
      case 'NEW':
        return { color: '#007AFF', label: t('tickets.statusLabel.NEW', 'New') };
      case 'ACKNOWLEDGED':
        return { color: '#AF52DE', label: t('tickets.statusLabel.ACKNOWLEDGED', 'Acknowledged') };
      case 'WAITING_INFORMATION':
        return { color: '#FFCC00', label: t('tickets.statusLabel.WAITING_INFORMATION', 'Waiting Info') };
      case 'IN_PROGRESS':
        return { color: '#FF9500', label: t('tickets.statusLabel.IN_PROGRESS', 'In Progress') };
      case 'SOLVED':
        return { color: '#34C759', label: t('tickets.statusLabel.SOLVED', 'Solved') };
      case 'CLOSED':
        return { color: '#8E8E93', label: t('tickets.statusLabel.CLOSED', 'Closed') };
      case 'CANCELLED':
        return { color: '#FF3B30', label: t('tickets.statusLabel.CANCELLED', 'Cancelled') };
      case 'CANNOT_RESOLVE':
      default:
        return { color: '#FF3B30', label: t('tickets.statusLabel.CANNOT_RESOLVE', 'Cannot Resolve') };
    }
  };

  const toggleExpand = (id: string) => {
    setExpandedId(prev => (prev === id ? null : id));
  };

  return (
    <Box className="flex-1 bg-black">
      {/* Background Ambient Glow */}
      <Box className="absolute top-0 left-0 right-0 h-[300px] opacity-20">
        <LinearGradient colors={['rgba(255, 149, 0, 0.15)', 'transparent']} style={{ flex: 1 }} />
      </Box>

      {/* Header */}
      <Box style={{ paddingTop: insets.top + 10 }} className="px-6 pb-4 flex-row items-center">
        <TouchableOpacity
          onPress={() => router.back()}
          className="w-10 h-10 rounded-full bg-white/5 items-center justify-center border border-white/10 mr-4"
        >
          <ChevronLeft size={24} color="white" />
        </TouchableOpacity>
        <Heading size="xl" className="text-white font-bold">
          {t('tickets.title', 'Tickets')}
        </Heading>
      </Box>

      {/* Main Content */}
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: 24,
          paddingBottom: 40,
        }}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={PRIMARY_RED} />}
      >
        {isLoading ? (
          <Center className="py-20">
            <Spinner size="large" className="text-brand-500" />
            <Text className="text-[#666] mt-4">{t('tickets.loading', 'Loading tickets...')}</Text>
          </Center>
        ) : tickets.length === 0 ? (
          <Center className="py-20 px-10">
            <BlurView intensity={15} tint="dark" style={styles.emptyCard}>
              <Box className="w-20 h-20 rounded-full bg-white/5 items-center justify-center mb-4 border border-white/5">
                <Tag size={40} color="#FF9500" />
              </Box>
              <Text className="text-center text-[#A0A0A0] font-medium mb-2">
                {t('tickets.noTickets', 'No tickets found for your department')}
              </Text>
            </BlurView>
          </Center>
        ) : (
          <VStack space="md" className="mt-4">
            {tickets.map(ticket => {
              const isExpanded = expandedId === ticket.id;
              const priorityConfig = getPriorityConfig(ticket.priority);
              const statusConfig = getStatusConfig(ticket.status);

              return (
                <BlurView key={ticket.id} intensity={20} tint="dark" style={styles.ticketCard}>
                  <TouchableOpacity onPress={() => toggleExpand(ticket.id)} activeOpacity={0.9}>
                    <VStack space="sm">
                      {/* Code and Priority Badge */}
                      <HStack className="justify-between items-center">
                        <Text className="text-[#FF9500] font-mono font-bold tracking-[0.5px]" size="sm">
                          {ticket.code}
                        </Text>

                        <Box
                          style={{ backgroundColor: priorityConfig.bgColor }}
                          className="px-2.5 py-1 rounded-full border border-white/5"
                        >
                          <Text
                            style={{ color: priorityConfig.color }}
                            className="font-bold text-[10px] uppercase tracking-[0.5px]"
                          >
                            {priorityConfig.label}
                          </Text>
                        </Box>
                      </HStack>

                      {/* Title & Chevron */}
                      <HStack className="justify-between items-start" space="sm">
                        <Heading size="md" className="text-white font-semibold flex-1 leading-6">
                          {ticket.title}
                        </Heading>
                        <Box className="mt-1">
                          {isExpanded ? (
                            <ChevronUp size={20} color="#666666" />
                          ) : (
                            <ChevronDown size={20} color="#666666" />
                          )}
                        </Box>
                      </HStack>

                      {/* Summary fields when closed */}
                      {!isExpanded && (
                        <HStack className="justify-between items-center mt-2">
                          <HStack space="xs" className="items-center">
                            <Box style={{ backgroundColor: statusConfig.color }} className="w-2 h-2 rounded-full" />
                            <Text className="text-[#A0A0A0]" size="2xs">
                              {statusConfig.label}
                            </Text>
                          </HStack>

                          <Text className="text-[#666]" size="2xs">
                            {format(new Date(ticket.createdAt), 'dd MMM yyyy', { locale: dateLocale })}
                          </Text>
                        </HStack>
                      )}
                    </VStack>
                  </TouchableOpacity>

                  {/* Expanded Content */}
                  {isExpanded && (
                    <VStack space="md" className="mt-4 pt-4 border-t border-white/5">
                      {/* Description */}
                      <VStack space="xs">
                        <Text className="text-[#666] font-bold uppercase tracking-[1px] mb-2" size="2xs">
                          {t('tickets.description', 'Description')}
                        </Text>
                        <RichTextViewer
                          html={ticket.description}
                          defaultTextColor="#D1D1D1"
                          fallback={t('tickets.noDescription', 'No description provided.')}
                        />
                      </VStack>

                      {/* Status and Created Info */}
                      <HStack className="justify-between items-center bg-white/5 p-3 rounded-2xl">
                        <VStack space="xs">
                          <Text className="text-[#666] font-bold uppercase tracking-[1.5px]" size="2xs">
                            {t('tickets.status', 'Status')}
                          </Text>
                          <HStack space="xs" className="items-center">
                            <Box style={{ backgroundColor: statusConfig.color }} className="w-2.5 h-2.5 rounded-full" />
                            <Text style={{ color: statusConfig.color }} className="font-bold uppercase" size="xs">
                              {statusConfig.label}
                            </Text>
                          </HStack>
                        </VStack>

                        <VStack space="xs" className="items-end">
                          <Text className="text-[#666] font-bold uppercase tracking-[1.5px]" size="2xs">
                            {t('tickets.createdDate', 'Created Date')}
                          </Text>
                          <HStack space="xs" className="items-center">
                            <Calendar size={12} color="#A0A0A0" />
                            <Text className="text-white font-medium" size="xs">
                              {format(new Date(ticket.createdAt), 'dd MMM yyyy', { locale: dateLocale })}
                            </Text>
                          </HStack>
                        </VStack>
                      </HStack>

                      {/* Details / Client and Target info */}
                      <VStack space="xs">
                        <Text className="text-[#666] font-bold uppercase tracking-[1px]" size="2xs">
                          {t('tickets.details', 'Ticket Details')}
                        </Text>

                        <VStack space="sm" className="bg-white/5 p-4 rounded-2xl">
                          {/* Submitter */}
                          {ticket.submitterAdmin && (
                            <HStack space="md" className="items-center">
                              <User size={16} color="#A0A0A0" />
                              <Text size="xs" className="text-[#D1D1D1]">
                                <Text className="font-bold text-[#A0A0A0]">
                                  {t('tickets.createdBy', 'Created By')}:{' '}
                                </Text>
                                {ticket.submitterAdmin.name}
                              </Text>
                            </HStack>
                          )}

                          {/* Target hours */}
                          <HStack space="md" className="items-center">
                            <Clock size={16} color="#A0A0A0" />
                            <Text size="xs" className="text-[#D1D1D1]">
                              <Text className="font-bold text-[#A0A0A0]">
                                {t('tickets.targetHours', 'SLA Target')}:{' '}
                              </Text>
                              {ticket.resolutionTargetHours} {t('tickets.hours', 'hours')}
                            </Text>
                          </HStack>

                          {/* Client Name */}
                          <HStack space="md" className="items-center">
                            <AlertCircle size={16} color="#A0A0A0" />
                            <Text size="xs" className="text-[#D1D1D1]">
                              <Text className="font-bold text-[#A0A0A0]">{t('tickets.clientName', 'Client')}: </Text>
                              {ticket.clientName}
                            </Text>
                          </HStack>

                          {/* Client Contact */}
                          <HStack space="md" className="items-center">
                            <Phone size={16} color="#A0A0A0" />
                            <Text size="xs" className="text-[#D1D1D1]">
                              <Text className="font-bold text-[#A0A0A0]">
                                {t('tickets.clientContact', 'Contact')}:{' '}
                              </Text>
                              {ticket.clientContact}
                            </Text>
                          </HStack>

                          {/* Location */}
                          <HStack space="md" className="items-center">
                            <MapPin size={16} color="#A0A0A0" />
                            <Text size="xs" className="text-[#D1D1D1]">
                              <Text className="font-bold text-[#A0A0A0]">{t('tickets.location', 'Location')}: </Text>
                              {ticket.clientLocation}
                            </Text>
                          </HStack>
                        </VStack>
                      </VStack>

                      {/* Open Discussion Button */}
                      <TouchableOpacity
                        onPress={() => router.push(`/tickets/${ticket.id}`)}
                        className="mt-2 py-3.5 rounded-2xl items-center justify-center border border-white/10 active:opacity-90 flex-row"
                        style={{ backgroundColor: PRIMARY_RED }}
                        activeOpacity={0.8}
                      >
                        <Text className="text-white font-bold text-sm">
                          {t('tickets.openDiscussion', 'Open Discussion')}
                        </Text>
                      </TouchableOpacity>
                    </VStack>
                  )}
                </BlurView>
              );
            })}
          </VStack>
        )}
      </ScrollView>
    </Box>
  );
}

const styles = StyleSheet.create({
  ticketCard: {
    borderRadius: 32,
    overflow: 'hidden',
    padding: 24,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
    backgroundColor: 'rgba(25, 25, 27, 0.6)',
  },
  emptyCard: {
    borderRadius: 32,
    overflow: 'hidden',
    padding: 32,
    width: '100%',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
    backgroundColor: 'rgba(25, 25, 27, 0.4)',
  },
});
