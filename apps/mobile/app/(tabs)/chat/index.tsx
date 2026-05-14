import React from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Text } from '@/components/ui/text';
import { Spinner } from '@/components/ui/spinner';
import { Center } from '@/components/ui/center';
import { ChatHeader } from '../../../src/components/chat/ChatHeader';
import { client } from '../../../src/api/client';
import { queryKeys } from '../../../src/api/queryKeys';
import { useChatUnread } from '../../../src/hooks/useChatUnread';
import { ChatInboxItem } from '@repo/types';
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
  const { unreadCount } = useChatUnread();

  const { data: groups = [], isLoading } = useQuery({
    queryKey: queryKeys.chat.groupList,
    queryFn: async () => {
      const response = await client.get('/api/shared/group-chat');
      return parseGroupChatListPayload(response.data);
    },
  });

  const items: ChatInboxItem[] = [
    directSupportInboxItem(unreadCount, t('chat.admin_support', 'Admin Support')),
    ...groups.map(mapGroupConversationToInboxItem),
  ];

  return (
    <View style={{ flex: 1, backgroundColor: '#121212' }}>
      <LinearGradient colors={['rgba(37, 99, 235, 0.05)', 'transparent']} style={[StyleSheet.absoluteFill, { height: '40%' }]} />
      <ChatHeader topInset={insets.top} title={t('chat.title')} statusText={t('chat.status_active').toUpperCase()} />
      {isLoading ? (
        <Center className="flex-1"><Spinner size="large" /></Center>
      ) : (
        <FlatList
          data={items}
          keyExtractor={item => `${item.kind}:${item.id}`}
          contentContainerStyle={{ padding: 16, gap: 10 }}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => {
                const key = inboxItemToConversationKey(item);
                if (key.kind === 'direct') {
                  router.push('/(tabs)/chat/direct');
                  return;
                }
                router.push(`/(tabs)/chat/group/${key.groupId}`);
              }}
              style={styles.item}
            >
              <Text style={styles.title}>{item.title}</Text>
              {item.unreadCount > 0 ? (
                <View style={styles.badge}><Text style={styles.badgeText}>{item.unreadCount}</Text></View>
              ) : null}
            </Pressable>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  item: {
    backgroundColor: 'rgba(40,40,40,0.7)',
    borderColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: { color: '#F8FAFC', fontSize: 15, fontWeight: '600' },
  badge: { backgroundColor: '#EF4444', minWidth: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  badgeText: { color: '#fff', fontSize: 12, fontWeight: '700' },
});
