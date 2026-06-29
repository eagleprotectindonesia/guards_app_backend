import React from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { format, isToday, isYesterday } from 'date-fns';
import { Headphones, Users, ChevronRight } from 'lucide-react-native';

import { Text } from '@/components/ui/text';
import { Spinner } from '@/components/ui/spinner';
import { Center } from '@/components/ui/center';
import { VStack } from '@/components/ui/vstack';
import { HStack } from '@/components/ui/hstack';
import { Heading } from '@/components/ui/heading';

import { ChatHeader } from '../../../src/components/chat/ChatHeader';
import { client } from '../../../src/api/client';
import { queryKeys } from '../../../src/api/queryKeys';
import { useAuth } from '../../../src/contexts/AuthContext';
import { ChatInboxItem, ChatMessage } from '@repo/types';
import { useSocket } from '../../../src/hooks/useSocket';
import { useSocketEvent } from '../../../src/hooks/useSocketEvent';
import {
  directSupportInboxItem,
  inboxItemToConversationKey,
  mapGroupConversationToInboxItem,
  parseGroupChatListPayload,
} from '../../../src/lib/chat-inbox';

export default function ChatInboxScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, isAuthenticated } = useAuth();
  const employeeId = user?.id;

  const { data: directUnreadCount = 0 } = useQuery({
    queryKey: queryKeys.chat.unread,
    queryFn: async () => {
      const response = await client.get('/api/shared/chat/unread');
      return response.data.count as number;
    },
  });

  const { data: groups = [], isLoading } = useQuery({
    queryKey: queryKeys.chat.groupList,
    queryFn: async () => {
      const response = await client.get('/api/shared/group-chat');
      return parseGroupChatListPayload(response.data);
    },
  });

  const { data: directLatestMessage } = useQuery({
    queryKey: queryKeys.chat.directLatest(employeeId),
    queryFn: async () => {
      if (!employeeId || !isAuthenticated) return null;
      const response = await client.get(`/api/shared/chat/${employeeId}`, {
        params: { limit: 1 },
      });
      const messages = response.data as { content: string; sender: 'admin' | 'employee'; createdAt: string }[];
      return messages[0] ?? null;
    },
    enabled: !!employeeId && isAuthenticated,
  });

  const queryClient = useQueryClient();
  const { socket } = useSocket();

  useSocketEvent(socket, 'new_message', (_message: ChatMessage) => {
    if (!employeeId) return;
    queryClient.invalidateQueries({ queryKey: queryKeys.chat.directLatest(employeeId) });
    queryClient.invalidateQueries({ queryKey: queryKeys.chat.unread });
  });

  useSocketEvent(socket, 'group_new_message', () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.chat.groupList });
  });

  const items: ChatInboxItem[] = [
    {
      ...directSupportInboxItem(directUnreadCount, t('chat.admin_support', 'Admin Support')),
      lastMessage: directLatestMessage
        ? {
            content: directLatestMessage.content,
            senderName: directLatestMessage.sender === 'employee' ? t('chat.you', 'You') : t('chat.admin_support', 'Admin Support'),
            createdAt: directLatestMessage.createdAt,
          }
        : null,
    },
    ...groups.map(mapGroupConversationToInboxItem),
  ];

  const formatTime = (date: Date | string | null) => {
    if (!date) return '';
    const d = new Date(date);
    if (isToday(d)) return format(d, 'HH:mm');
    if (isYesterday(d)) return t('chat.yesterday', 'Yesterday');
    return format(d, 'dd/MM/yy');
  };

  const renderInboxItem = ({ item }: { item: ChatInboxItem }) => {
    const isDirect = item.kind === 'direct';
    const lastMessageContent = item.lastMessage?.content || t('chat.noMessages', 'No messages yet');
    const isOwnGroupMessage = !isDirect && !!item.lastMessage?.senderName && item.lastMessage.senderName === user?.fullName;
    const senderLabel = isOwnGroupMessage ? t('chat.you', 'You') : item.lastMessage?.senderName;
    const lastMessage = senderLabel ? `${senderLabel}: ${lastMessageContent}` : lastMessageContent;
    const time = item.lastMessage?.createdAt ? formatTime(item.lastMessage.createdAt) : '';

    return (
      <Pressable
        onPress={() => {
          const key = inboxItemToConversationKey(item);
          if (key.kind === 'direct') {
            router.push('/(tabs)/chat/direct');
            return;
          }
          router.push(`/(tabs)/chat/group/${key.groupId}`);
        }}
        style={({ pressed }) => [
          styles.itemContainer,
          isDirect ? styles.directItem : styles.groupItem,
          pressed && styles.itemPressed
        ]}
      >
        <HStack space="md" className="items-center">
          <View style={[
            styles.avatarContainer,
            isDirect ? styles.directAvatar : styles.groupAvatar
          ]}>
            {isDirect ? (
              <Headphones size={20} color="#60A5FA" />
            ) : (
              <Users size={20} color="#94A3B8" />
            )}
            {item.unreadCount > 0 && <View style={styles.unreadDot} />}
          </View>

          <VStack className="flex-1" space="xs">
            <HStack className="justify-between items-center">
              <Heading size="sm" style={styles.itemTitle} numberOfLines={1}>
                {item.title}
              </Heading>
              <Text style={styles.timeText}>{time}</Text>
            </HStack>
            
            <HStack className="justify-between items-center" space="sm">
              <Text style={styles.lastMessageText} numberOfLines={1}>
                {lastMessage}
              </Text>
              
              {item.unreadCount > 0 ? (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{item.unreadCount}</Text>
                </View>
              ) : (
                <ChevronRight size={16} color="rgba(255,255,255,0.2)" />
              )}
            </HStack>
          </VStack>
        </HStack>
      </Pressable>
    );
  };

  return (
    <View style={styles.container}>
      <LinearGradient 
        colors={['rgba(255, 255, 255, 0.05)', 'rgba(255, 255, 255, 0.02)', 'transparent']} 
        style={[StyleSheet.absoluteFill, { height: '50%' }]} 
      />
      <ChatHeader 
        topInset={insets.top} 
        title={t('chat.title')} 
        statusText={t('chat.status_active').toUpperCase()} 
      />
      
      {isLoading ? (
        <Center className="flex-1">
          <Spinner size="large" />
        </Center>
      ) : (
        <FlatList
          data={items}
          keyExtractor={item => `${item.kind}:${item.id}`}
          contentContainerStyle={{ padding: 20, paddingBottom: 100, gap: 12 }}
          renderItem={renderInboxItem}
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { 
    flex: 1, 
    backgroundColor: '#121212' 
  },
  itemContainer: {
    borderColor: 'rgba(255, 255, 255, 0.06)',
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
  },
  groupItem: {
    backgroundColor: 'rgba(30, 30, 30, 0.7)',
  },
  directItem: {
    backgroundColor: 'rgba(37, 99, 235, 0.1)',
    borderColor: 'rgba(37, 99, 235, 0.2)',
  },
  itemPressed: {
    opacity: 0.8,
    transform: [{ scale: 0.98 }],
  },
  avatarContainer: {
    width: 52,
    height: 52,
    borderRadius: 26,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
    borderWidth: 1,
  },
  directAvatar: {
    backgroundColor: 'rgba(37, 99, 235, 0.15)',
    borderColor: 'rgba(37, 99, 235, 0.3)',
  },
  groupAvatar: {
    backgroundColor: 'rgba(148, 163, 184, 0.1)',
    borderColor: 'rgba(148, 163, 184, 0.2)',
  },
  unreadDot: {
    position: 'absolute',
    top: 2,
    right: 2,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#3B82F6',
    borderWidth: 2,
    borderColor: '#1E293B',
  },
  itemTitle: { 
    color: '#F8FAFC', 
    fontWeight: '700',
    flex: 1,
  },
  timeText: { 
    color: '#94A3B8', 
    fontSize: 12,
    fontWeight: '500',
  },
  lastMessageText: { 
    color: '#94A3B8', 
    fontSize: 13, 
    flex: 1,
    opacity: 0.8,
  },
  badge: { 
    backgroundColor: '#3B82F6', 
    minWidth: 20, 
    height: 20, 
    borderRadius: 10, 
    alignItems: 'center', 
    justifyContent: 'center', 
    paddingHorizontal: 6,
  },
  badgeText: { 
    color: '#fff', 
    fontSize: 10, 
    fontWeight: '800' 
  },
});
