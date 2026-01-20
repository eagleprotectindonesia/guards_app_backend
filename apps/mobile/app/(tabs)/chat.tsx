import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { 
  FlatList, 
  KeyboardAvoidingView, 
  Platform, 
  StyleSheet, 
  TextInput, 
  TouchableOpacity, 
  View,
  Image
} from 'react-native';
import { 
  VStack, 
  Heading, 
  Text, 
  Center, 
  Avatar, 
  AvatarFallbackText, 
  HStack,
  Spinner
} from '@gluestack-ui/themed';
import { useTranslation } from 'react-i18next';
import { Send } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { getSocket } from '../../src/api/socket';
import { client } from '../../src/api/client';
import { storage, STORAGE_KEYS } from '../../src/utils/storage';
import { format } from 'date-fns';

interface ChatMessage {
  id: string;
  employeeId: string;
  adminId?: string | null;
  sender: 'admin' | 'employee';
  content: string;
  attachments: string[];
  createdAt: string;
  readAt?: string | null;
  admin?: {
    id: string;
    name: string;
  } | null;
}

export default function ChatScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  
  const [inputText, setInputText] = useState('');
  const [employeeInfo, setEmployeeInfo] = useState<any>(null);
  const [isFocused, setIsFocused] = useState(false);
  const socketRef = useRef<any>(null);
  const flatListRef = useRef<FlatList>(null);

  // Load employee info from storage
  useEffect(() => {
    storage.getItem(STORAGE_KEYS.EMPLOYEE_INFO).then(setEmployeeInfo);
  }, []);

  // Fetch messages with TanStack Query (Infinite Query for pagination)
  const { 
    data, 
    fetchNextPage, 
    hasNextPage, 
    isFetchingNextPage, 
    isLoading 
  } = useInfiniteQuery({
    queryKey: ['chat', 'messages', employeeInfo?.id],
    queryFn: async ({ pageParam }) => {
      const response = await client.get(`/api/shared/chat/${employeeInfo.id}`, {
        params: {
          limit: 15,
          cursor: pageParam,
        }
      });
      return response.data as ChatMessage[];
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => {
      if (lastPage.length < 15) return undefined;
      return lastPage[lastPage.length - 1].id;
    },
    enabled: !!employeeInfo?.id,
  });

  const messages = useMemo(() => data?.pages.flat() || [], [data]);
  
  const employeeId = employeeInfo?.id;
  const markMessagesAsRead = useCallback((msgs: ChatMessage[]) => {
    if (!socketRef.current || !msgs.length || !employeeId) return;
    
    const unreadIds = msgs
      .filter(m => m.sender === 'admin' && !m.readAt)
      .map(m => m.id);
    
    if (unreadIds.length > 0) {
      console.log(`Marking ${unreadIds.length} messages as read for employee ${employeeId}`);
      socketRef.current.emit('mark_read', { 
        employeeId,
        messageIds: unreadIds 
      });
    }
  }, [employeeId]);

  useFocusEffect(
    useCallback(() => {
      setIsFocused(true);
      return () => setIsFocused(false);
    }, [])
  );

  // Trigger mark as read when focused and messages or socket becomes available
  useEffect(() => {
    if (isFocused && messages.length > 0 && socketRef.current?.connected) {
      markMessagesAsRead(messages);
    }
  }, [isFocused, messages, markMessagesAsRead]);

  // Socket setup
  useEffect(() => {
    if (!employeeId) return;

    let socketInstance: any = null;

    const setupSocket = async () => {
      const socket = await getSocket();
      if (socket) {
        socketRef.current = socket;
        socketInstance = socket;

        socket.on('new_message', (message: ChatMessage) => {
          // Update message list cache
          queryClient.setQueryData(['chat', 'messages', employeeId], (old: any) => {
            if (!old) return old;
            return {
              ...old,
              pages: [
                [message, ...old.pages[0]],
                ...old.pages.slice(1)
              ]
            };
          });
          
          // If we are currently looking at the chat, mark it as read immediately
          if (isFocused && message.sender === 'admin') {
            socket.emit('mark_read', { 
              employeeId,
              messageIds: [message.id] 
            });
          }
          
          // Invalidate unread count query
          queryClient.invalidateQueries({ queryKey: ['chat', 'unread'] });
        });

        socket.on('messages_read', (data: { messageIds: string[] }) => {
          // Update messages in cache to show read status
          queryClient.setQueryData(['chat', 'messages', employeeId], (old: any) => {
            if (!old) return old;
            return {
              ...old,
              pages: old.pages.map((page: ChatMessage[]) => 
                page.map(msg => 
                  data.messageIds.includes(msg.id) ? { ...msg, readAt: new Date().toISOString() } : msg
                )
              )
            };
          });
          
          // Invalidate unread count query
          queryClient.invalidateQueries({ queryKey: ['chat', 'unread'] });
        });
      }
    };

    setupSocket();

    return () => {
      if (socketInstance) {
        socketInstance.off('new_message');
        socketInstance.off('messages_read');
      }
    };
  }, [employeeId, isFocused, queryClient]);

  const sendMessage = () => {
    if (!inputText.trim() || !socketRef.current) return;

    socketRef.current.emit('send_message', {
      content: inputText.trim(),
    });

    setInputText('');
  };

  const renderItem = ({ item }: { item: ChatMessage }) => {
    const isMe = item.sender === 'employee';
    return (
      <View style={[
        styles.messageContainer,
        isMe ? styles.myMessage : styles.theirMessage
      ]}>
        {!isMe && (
          <Avatar size="xs" bgColor="$blue600" mr="$2">
            <AvatarFallbackText>{item.admin?.name || 'A'}</AvatarFallbackText>
          </Avatar>
        )}
        <VStack style={[
          styles.messageBubble,
          isMe ? styles.myBubble : styles.theirBubble
        ]}>
          {item.attachments && item.attachments.length > 0 && (
            <View style={styles.attachmentsContainer}>
              {item.attachments.map((url, i) => (
                <Image
                  key={i}
                  source={{ uri: url }}
                  style={[
                    styles.attachmentImage,
                    item.attachments.length > 1 && styles.multiAttachmentImage
                  ]}
                  resizeMode="cover"
                />
              ))}
            </View>
          )}
          <Text style={[
            styles.messageText,
            isMe ? styles.myText : styles.theirText
          ]}>
            {item.content}
          </Text>
          <Text style={[
            styles.messageTime,
            isMe ? styles.myTime : styles.theirTime
          ]}>
            {format(new Date(item.createdAt), 'HH:mm')}
          </Text>
        </VStack>
      </View>
    );
  };

  if (isLoading && messages.length === 0) {
    return (
      <Center flex={1}>
        <Spinner size="large" />
      </Center>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#F3F4F6' }}>
      {/* Header */}
      <View style={{ paddingTop: insets.top, backgroundColor: 'white', borderBottomWidth: 1, borderColor: '#E5E7EB' }}>
        <HStack px="$4" py="$3" alignItems="center">
          <Heading size="lg">{t('chat.title', 'Admin Support')}</Heading>
        </HStack>
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        <View style={{ flex: 1 }}>
          <FlatList
            ref={flatListRef}
            data={messages}
            inverted
            keyExtractor={(item) => item.id}
            renderItem={renderItem}
            contentContainerStyle={{ padding: 16, flexGrow: 1 }}
            style={{ flex: 1 }}
            onEndReached={() => {
              if (hasNextPage && !isFetchingNextPage) {
                fetchNextPage();
              }
            }}
            onEndReachedThreshold={0.5}
            ListFooterComponent={() => (
              isFetchingNextPage ? (
                <View style={{ padding: 10 }}>
                  <Spinner size="small" />
                </View>
              ) : null
            )}
          />
        </View>

        {/* Input Area */}
        <View style={{ 
          backgroundColor: 'white', 
          borderTopWidth: 1, 
          borderColor: '#E5E7EB',
          paddingHorizontal: 16,
          paddingTop: 8,
          paddingBottom: insets.bottom + 8
        }}>
          <HStack space="sm" alignItems="center">
            <TextInput
              style={styles.input}
              placeholder={t('chat.placeholder', 'Type a message...')}
              value={inputText}
              onChangeText={setInputText}
              multiline
            />
            <TouchableOpacity 
              onPress={sendMessage}
              disabled={!inputText.trim()}
              style={[
                styles.sendButton,
                !inputText.trim() && styles.sendButtonDisabled
              ]}
            >
              <Send size={20} color="white" />
            </TouchableOpacity>
          </HStack>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  messageContainer: {
    flexDirection: 'row',
    marginBottom: 12,
    maxWidth: '80%',
  },
  myMessage: {
    alignSelf: 'flex-end',
    flexDirection: 'row-reverse',
  },
  theirMessage: {
    alignSelf: 'flex-start',
  },
  messageBubble: {
    padding: 10,
    borderRadius: 16,
  },
  myBubble: {
    backgroundColor: '#2563EB',
    borderBottomRightRadius: 4,
  },
  theirBubble: {
    backgroundColor: '#E5E7EB',
    borderBottomLeftRadius: 4,
  },
  messageText: {
    fontSize: 15,
  },
  myText: {
    color: 'white',
  },
  theirText: {
    color: '#111827',
  },
  messageTime: {
    fontSize: 10,
    marginTop: 4,
    alignSelf: 'flex-end',
  },
  myTime: {
    color: 'rgba(255, 255, 255, 0.7)',
  },
  theirTime: {
    color: '#6B7280',
  },
  input: {
    flex: 1,
    backgroundColor: '#F3F4F6',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
    maxHeight: 100,
    fontSize: 15,
  },
  sendButton: {
    backgroundColor: '#2563EB',
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendButtonDisabled: {
    backgroundColor: '#93C5FD',
  },
  attachmentsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    marginBottom: 8,
    width: 200,
  },
  attachmentImage: {
    width: 200,
    height: 150,
    borderRadius: 8,
  },
  multiAttachmentImage: {
    width: 98,
    height: 98,
  }
});