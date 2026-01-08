import React, { useState, useEffect, useRef } from 'react';
import { 
  FlatList, 
  KeyboardAvoidingView, 
  Platform, 
  StyleSheet, 
  TextInput, 
  TouchableOpacity, 
  View 
} from 'react-native';
import { 
  Box, 
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
import { MessageSquare, Send } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getSocket } from '../../src/api/socket';
import { client } from '../../src/api/client';
import { storage, STORAGE_KEYS } from '../../src/utils/storage';
import { format } from 'date-fns';

interface ChatMessage {
  id: string;
  guardId: string;
  adminId?: string | null;
  sender: 'admin' | 'guard';
  content: string;
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
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [guardInfo, setGuardInfo] = useState<any>(null);
  const socketRef = useRef<any>(null);
  const flatListRef = useRef<FlatList>(null);

  useEffect(() => {
    const initChat = async () => {
      try {
        const info = await storage.getItem(STORAGE_KEYS.GUARD_INFO);
        setGuardInfo(info);

        if (info?.id) {
          // Fetch history (newest first from API)
          const response = await client.get(`/api/chat/${info.id}`);
          setMessages(response.data); 
          setIsLoading(false);

          // Init Socket
          const socket = await getSocket();
          if (socket) {
            socketRef.current = socket;

            socket.on('new_message', (message: ChatMessage) => {
              setMessages(prev => [message, ...prev]);
            });

            socket.on('messages_read', (data: { messageIds: string[] }) => {
              setMessages(prev => prev.map(msg => 
                data.messageIds.includes(msg.id) ? { ...msg, readAt: new Date().toISOString() } : msg
              ));
            });
          }
        }
      } catch (error) {
        console.error('Failed to init chat:', error);
        setIsLoading(false);
      }
    };

    initChat();

    return () => {
      if (socketRef.current) {
        socketRef.current.off('new_message');
        socketRef.current.off('messages_read');
      }
    };
  }, []);

  const sendMessage = () => {
    if (!inputText.trim() || !socketRef.current) return;

    socketRef.current.emit('send_message', {
      content: inputText.trim(),
    });

    setInputText('');
  };

  const renderItem = ({ item }: { item: ChatMessage }) => {
    const isMe = item.sender === 'guard';
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

  if (isLoading) {
    return (
      <Center flex={1}>
        <Spinner size="large" />
      </Center>
    );
  }

  return (
    <Box className="flex-1 bg-gray-50">
      <View style={{ paddingTop: insets.top, backgroundColor: 'white' }}>
        <HStack px="$4" py="$3" alignItems="center" borderBottomWidth={1} borderColor="$gray200">
          <Heading size="lg">{t('chat.title', 'Admin Support')}</Heading>
        </HStack>
      </View>

      <FlatList
        ref={flatListRef}
        data={messages}
        inverted
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={{ padding: 16 }}
      />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        <Box px="$4" py="$2" bg="white" borderTopWidth={1} borderColor="$gray200" style={{ paddingBottom: insets.bottom + 8 }}>
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
        </Box>
      </KeyboardAvoidingView>
    </Box>
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
  }
});