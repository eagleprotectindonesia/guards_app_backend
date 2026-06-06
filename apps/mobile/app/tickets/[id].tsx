import React, { useState, useRef, useEffect } from 'react';
import { ScrollView, TouchableOpacity, StyleSheet, TextInput, Platform, Keyboard, Linking, View } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { Box } from '@/components/ui/box';
import { VStack } from '@/components/ui/vstack';
import { HStack } from '@/components/ui/hstack';
import { Heading } from '@/components/ui/heading';
import { Text } from '@/components/ui/text';
import { Spinner } from '@/components/ui/spinner';
import { Center } from '@/components/ui/center';
import { useTranslation } from 'react-i18next';
import { useRouter, useLocalSearchParams } from 'expo-router';
import {
  ChevronLeft,
  Calendar,
  Clock,
  User,
  MapPin,
  Phone,
  AlertCircle,
  Send,
  FileText,
  Download,
} from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTicketDetail, useSendTicketMessage, useClaimTicket } from '../../src/hooks/useTickets';
import { useProfile } from '../../src/hooks/useProfile';
import { RichTextViewer } from '../../src/components/RichTextViewer';
import { format } from 'date-fns';
import { id as dateId, enUS } from 'date-fns/locale';
import { LinearGradient } from 'expo-linear-gradient';
import { TicketPriority, TicketStatus } from '@repo/types';

const PRIMARY_RED = '#FF3B30';

function getInitials(name: string) {
  if (!name) return 'US';
  return name
    .split(' ')
    .map(n => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

function getAvatarColor(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const colors = [
    '#5856D6', // Purple
    '#007AFF', // Blue
    '#34C759', // Green
    '#FF9500', // Orange
    '#AF52DE', // Violet
    '#FF2D55', // Pink
    '#5AC8FA', // Teal
  ];
  const index = Math.abs(hash) % colors.length;
  return colors[index] || '#5856D6';
}

export default function TicketDetailScreen() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();

  const { data, isLoading } = useTicketDetail(id);
  const sendMsgMutation = useSendTicketMessage(id);
  const claimMutation = useClaimTicket(id);
  const { data: profileData } = useProfile();

  const [activeTab, setActiveTab] = useState<'details' | 'discussion' | 'attachments'>('discussion');
  const [messageText, setMessageText] = useState('');

  const scrollViewRef = useRef<ScrollView>(null);

  const ticket = data?.ticket;
  const currentEmployeeId = profileData?.employee?.id;
  const dateLocale = i18n.language === 'id' ? dateId : enUS;

  useEffect(() => {
    if (activeTab === 'discussion') {
      setTimeout(() => {
        scrollViewRef.current?.scrollToEnd({ animated: true });
      }, 300);
    }
  }, [activeTab, ticket?.messages]);

  const getPriorityConfig = (priority?: TicketPriority) => {
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

  const getStatusConfig = (status?: TicketStatus) => {
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
      case 'CANNOT_RESOLVE':
      default:
        return { color: '#FF3B30', label: t('tickets.statusLabel.CANNOT_RESOLVE', 'Cannot Resolve') };
    }
  };

  const handleSend = () => {
    console.log('Sending message:', messageText);
    if (!messageText.trim()) return;
    sendMsgMutation.mutate(messageText.trim(), {
      onSuccess: () => {
        setMessageText('');
        Keyboard.dismiss();
      },
    });
  };

  const handleOpenUrl = (url?: string | null) => {
    if (url) {
      Linking.openURL(url).catch(err => console.error('Failed to open URL', err));
    }
  };

  const formatFileSize = (bytes?: number) => {
    if (!bytes) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  if (isLoading) {
    return (
      <Box className="flex-1 bg-black">
        <Center className="flex-1">
          <Spinner size="large" className="text-brand-500" />
        </Center>
      </Box>
    );
  }

  if (!ticket) {
    return (
      <Box className="flex-1 bg-black">
        <Box style={{ paddingTop: insets.top + 10 }} className="px-6 pb-4 flex-row items-center">
          <TouchableOpacity
            onPress={() => router.back()}
            className="w-10 h-10 rounded-full bg-white/5 items-center justify-center border border-white/10 mr-4"
          >
            <ChevronLeft size={24} color="white" />
          </TouchableOpacity>
        </Box>
        <Center className="flex-1 px-6">
          <AlertCircle size={48} color={PRIMARY_RED} />
          <Text className="text-white font-bold mt-4 text-center">
            {t('tickets.notFound', 'Ticket not found or access denied')}
          </Text>
        </Center>
      </Box>
    );
  }

  const priorityConfig = getPriorityConfig(ticket.priority);
  const statusConfig = getStatusConfig(ticket.status);

  return (
    <KeyboardAvoidingView
      behavior="padding"
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      style={{ flex: 1 }}
      className="bg-black"
    >
      {/* Background Ambient Glow */}
      <Box className="absolute top-0 left-0 right-0 h-[250px] opacity-20">
        <LinearGradient colors={['rgba(255, 149, 0, 0.12)', 'transparent']} style={{ flex: 1 }} />
      </Box>

      {/* Header */}
      <Box style={{ paddingTop: insets.top + 10 }} className="px-6 pb-4 border-b border-white/5">
        <HStack className="items-center justify-between">
          <HStack space="md" className="items-center flex-1">
            <TouchableOpacity
              onPress={() => router.back()}
              className="w-10 h-10 rounded-full bg-white/5 items-center justify-center border border-white/10"
            >
              <ChevronLeft size={24} color="white" />
            </TouchableOpacity>
            <VStack className="flex-1">
              <Text className="text-[#FF9500] font-mono font-bold tracking-[0.5px]" size="xs">
                {ticket.code}
              </Text>
              <Heading size="md" className="text-white font-semibold truncate leading-5" numberOfLines={1}>
                {ticket.title}
              </Heading>
            </VStack>
          </HStack>

          <Box
            style={{ backgroundColor: priorityConfig.bgColor }}
            className="px-2.5 py-1 rounded-full border border-white/5 ml-2"
          >
            <Text style={{ color: priorityConfig.color }} className="font-bold text-[10px] uppercase tracking-[0.5px]">
              {priorityConfig.label}
            </Text>
          </Box>
        </HStack>

        {/* Claim Ticket Row */}
        {ticket.claimedByEmployeeId === currentEmployeeId ? (
          <Box className="mt-3 bg-emerald-500/10 py-2.5 rounded-xl items-center justify-center border border-emerald-500/20">
            <Text className="text-emerald-400 font-bold text-xs uppercase tracking-wider">
              {t('tickets.claimedByYou', 'Claimed By You')}
            </Text>
          </Box>
        ) : ticket.claimedByEmployeeId ? (
          <Box className="mt-3 bg-white/5 py-2.5 rounded-xl items-center justify-center border border-white/10">
            <Text className="text-[#A0A0A0] font-bold text-xs uppercase tracking-wider">
              {t('tickets.claimedByOtherGuard', 'Claimed by Another Guard')}
            </Text>
          </Box>
        ) : ticket.claimedByAdminId ? (
          <Box className="mt-3 bg-purple-500/10 py-2.5 rounded-xl items-center justify-center border border-purple-500/20">
            <Text className="text-purple-400 font-bold text-xs uppercase tracking-wider">
              {t('tickets.claimedByAdmin', 'Claimed by Admin')}
            </Text>
          </Box>
        ) : (
          <TouchableOpacity
            onPress={() => claimMutation.mutate()}
            disabled={claimMutation.isPending}
            className="mt-3 py-2.5 rounded-xl items-center justify-center active:scale-95 flex-row border border-white/5"
            style={{ backgroundColor: '#FF3B30', opacity: claimMutation.isPending ? 0.6 : 1 }}
            activeOpacity={0.8}
          >
            <Text className="text-white font-bold text-xs uppercase tracking-wider">
              {claimMutation.isPending
                ? t('tickets.claiming', 'CLAIMING...')
                : t('tickets.claimTicket', 'CLAIM TICKET')}
            </Text>
          </TouchableOpacity>
        )}
      </Box>

      {/* Tabs */}
      <HStack className="justify-around border-b border-white/5 pb-2 mt-4 px-6" space="md">
        {(['details', 'discussion', 'attachments'] as const).map(tab => {
          const isActive = activeTab === tab;
          return (
            <TouchableOpacity key={tab} onPress={() => setActiveTab(tab)} className="pb-2 px-3 relative">
              <Text
                className={isActive ? 'text-white font-bold' : 'text-[#8E8E93]'}
                size="sm"
                style={{ textTransform: 'capitalize' }}
              >
                {t(
                  `tickets.tabs.${tab}`,
                  tab === 'details' ? 'Details' : tab === 'discussion' ? 'Discussion' : 'Attachments'
                )}
              </Text>
              {isActive && (
                <Box
                  className="absolute bottom-0 left-0 right-0 h-[3px] rounded-full"
                  style={{ backgroundColor: PRIMARY_RED }}
                />
              )}
            </TouchableOpacity>
          );
        })}
      </HStack>

      {/* Content */}
      <View className="flex-1">
        {activeTab === 'details' && (
          <ScrollView contentContainerStyle={{ padding: 24, paddingBottom: 40 }}>
            <VStack space="lg">
              {/* Description Card */}
              <Box style={styles.card}>
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
              </Box>

              {/* Status and Created Info */}
              <HStack className="justify-between items-center bg-white/5 p-4 rounded-2xl border border-white/5">
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

              {/* Ticket Details */}
              <VStack space="xs">
                <Text className="text-[#666] font-bold uppercase tracking-[1px]" size="2xs">
                  {t('tickets.details', 'Ticket Details')}
                </Text>
                <VStack space="sm" style={styles.card}>
                  {ticket.submitterAdmin && (
                    <HStack space="md" className="items-center">
                      <User size={16} color="#A0A0A0" />
                      <Text size="xs" className="text-[#D1D1D1]">
                        <Text className="font-bold text-[#A0A0A0]">{t('tickets.createdBy', 'Created By')}: </Text>
                        {ticket.submitterAdmin.name}
                      </Text>
                    </HStack>
                  )}

                  <HStack space="md" className="items-center">
                    <Clock size={16} color="#A0A0A0" />
                    <Text size="xs" className="text-[#D1D1D1]">
                      <Text className="font-bold text-[#A0A0A0]">{t('tickets.targetHours', 'SLA Target')}: </Text>
                      {ticket.resolutionTargetHours} {t('tickets.hours', 'hours')}
                    </Text>
                  </HStack>
                </VStack>
              </VStack>

              {/* Client Info */}
              <VStack space="xs">
                <Text className="text-[#666] font-bold uppercase tracking-[1px]" size="2xs">
                  {t('tickets.clientInfo', 'Client Info')}
                </Text>
                <VStack space="sm" style={styles.card}>
                  <HStack space="md" className="items-center">
                    <User size={16} color="#A0A0A0" />
                    <Text size="xs" className="text-[#D1D1D1]">
                      <Text className="font-bold text-[#A0A0A0]">{t('tickets.clientName', 'Client')}: </Text>
                      {ticket.clientName}
                    </Text>
                  </HStack>

                  <HStack space="md" className="items-center">
                    <Phone size={16} color="#A0A0A0" />
                    <Text size="xs" className="text-[#D1D1D1]">
                      <Text className="font-bold text-[#A0A0A0]">{t('tickets.clientContact', 'Contact')}: </Text>
                      {ticket.clientContact}
                    </Text>
                  </HStack>

                  <HStack space="md" className="items-center">
                    <MapPin size={16} color="#A0A0A0" />
                    <Text size="xs" className="text-[#D1D1D1]">
                      <Text className="font-bold text-[#A0A0A0]">{t('tickets.location', 'Location')}: </Text>
                      {ticket.clientLocation}
                    </Text>
                  </HStack>
                </VStack>
              </VStack>
            </VStack>
          </ScrollView>
        )}

        {activeTab === 'discussion' && (
          <VStack className="flex-1">
            <ScrollView
              ref={scrollViewRef}
              contentContainerStyle={{ padding: 20, paddingBottom: 30 }}
              className="flex-1"
            >
              {ticket.messages.length === 0 ? (
                <Center className="py-20">
                  <Text className="text-[#666] font-medium">
                    {t('tickets.noMessages', 'No discussion messages yet.')}
                  </Text>
                </Center>
              ) : (
                <VStack space="lg">
                  {ticket.messages.map(message => {
                    const senderName = message.admin?.name ?? message.employee?.fullName ?? 'System';
                    const isGuard = !!message.employee;
                    const isAdmin = !!message.admin;

                    const initials = getInitials(senderName);
                    const avatarColor = getAvatarColor(senderName);

                    const formattedDate = format(new Date(message.createdAt), 'd MMM yyyy, hh:mm a', {
                      locale: dateLocale,
                    });

                    return (
                      <HStack key={message.id} space="md" className="items-start">
                        {/* Avatar */}
                        <Box
                          style={{
                            backgroundColor: avatarColor,
                            width: 36,
                            height: 36,
                            borderRadius: 18,
                          }}
                          className="items-center justify-center border border-white/5"
                        >
                          <Text className="text-white font-bold text-xs">{initials}</Text>
                        </Box>

                        {/* Content Column */}
                        <VStack className="flex-1">
                          {/* Name, Badge, Date */}
                          <HStack space="xs" className="items-center flex-wrap mb-1.5">
                            <Text className="text-white font-bold text-xs">{senderName}</Text>
                            {isGuard && (
                              <Box className="bg-white/5 px-1.5 py-0.2 rounded border border-white/10 ml-1">
                                <Text className="text-[#A0A0A0] font-bold text-[8px] uppercase">
                                  {t('tickets.badgeGuard', 'Guard')}
                                </Text>
                              </Box>
                            )}
                            {isAdmin && (
                              <Box className="bg-purple-500/10 px-1.5 py-0.2 rounded border border-purple-500/20 ml-1">
                                <Text className="text-purple-400 font-bold text-[8px] uppercase">
                                  {t('tickets.badgeAdmin', 'Admin')}
                                </Text>
                              </Box>
                            )}
                            <Text className="text-[#666] ml-2 text-[10px]">{formattedDate}</Text>
                          </HStack>

                          {/* Message Body Card */}
                          <Box style={styles.timelineBubble}>
                            <Text className="text-[#D1D1D1] leading-5" size="sm">
                              {message.body}
                            </Text>

                            {/* Message Attachments */}
                            {message.attachments && message.attachments.length > 0 && (
                              <VStack space="xs" className="mt-3 pt-2 border-t border-white/5">
                                {message.attachments.map(att => (
                                  <TouchableOpacity
                                    key={att.id}
                                    onPress={() => handleOpenUrl(att.publicUrl)}
                                    className="flex-row items-center bg-black/30 p-2.5 rounded-xl border border-white/5"
                                  >
                                    <FileText size={16} color="#A0A0A0" />
                                    <VStack className="flex-1 ml-2 mr-4">
                                      <Text className="text-white font-medium truncate" size="2xs">
                                        {att.fileName}
                                      </Text>
                                      <Text className="text-[#666]" size="2xs">
                                        {formatFileSize(att.fileSize)}
                                      </Text>
                                    </VStack>
                                    <Download size={14} color="white" />
                                  </TouchableOpacity>
                                ))}
                              </VStack>
                            )}
                          </Box>
                        </VStack>
                      </HStack>
                    );
                  })}
                </VStack>
              )}
            </ScrollView>

            {/* Input Bar */}
            <Box
              style={{ paddingBottom: insets.bottom + 10 }}
              className="p-4 bg-black border-t border-white/5 flex-row items-center"
            >
              <TextInput
                value={messageText}
                onChangeText={setMessageText}
                placeholder={t('tickets.typeMessage', 'Type your message...')}
                placeholderTextColor="#666"
                className="flex-1 bg-white/5 border border-white/10 rounded-2xl px-4 py-3 text-white text-sm mr-3 focus:border-brand-500"
                multiline
                style={{ maxHeight: 100 }}
              />
              <TouchableOpacity
                onPress={handleSend}
                disabled={!messageText.trim() || sendMsgMutation.isPending}
                className="w-11 h-11 rounded-full items-center justify-center active:scale-95"
                style={{
                  backgroundColor: messageText.trim() ? PRIMARY_RED : 'rgba(255, 255, 255, 0.05)',
                  opacity: sendMsgMutation.isPending ? 0.6 : 1,
                }}
              >
                {sendMsgMutation.isPending ? (
                  <Spinner size="small" className="text-white" />
                ) : (
                  <Send size={18} color="white" />
                )}
              </TouchableOpacity>
            </Box>
          </VStack>
        )}

        {activeTab === 'attachments' && (
          <ScrollView contentContainerStyle={{ padding: 24, paddingBottom: 40 }}>
            {ticket.attachments.length === 0 ? (
              <Center className="py-20">
                <FileText size={40} color="#333" className="mb-2" />
                <Text className="text-[#666] font-medium">
                  {t('tickets.noAttachments', 'No attachments uploaded.')}
                </Text>
              </Center>
            ) : (
              <VStack space="md">
                {ticket.attachments.map(att => (
                  <TouchableOpacity
                    key={att.id}
                    onPress={() => handleOpenUrl(att.publicUrl)}
                    style={styles.card}
                    className="flex-row items-center justify-between"
                  >
                    <HStack space="md" className="items-center flex-1 mr-4">
                      <Box className="p-3 bg-white/5 rounded-xl border border-white/5">
                        <FileText size={20} color="#FF9500" />
                      </Box>
                      <VStack className="flex-1">
                        <Text className="text-white font-semibold truncate" size="sm">
                          {att.fileName}
                        </Text>
                        <Text className="text-[#666]" size="xs">
                          {formatFileSize(att.fileSize)}
                        </Text>
                      </VStack>
                    </HStack>
                    <Download size={18} color="white" />
                  </TouchableOpacity>
                ))}
              </VStack>
            )}
          </ScrollView>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: 'rgba(18, 18, 18, 0.85)',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
    padding: 16,
  },
  timelineBubble: {
    backgroundColor: 'rgba(25, 25, 27, 0.4)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
    padding: 16,
    alignSelf: 'stretch',
  },
});
