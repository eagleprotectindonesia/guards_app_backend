import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  FlatList,
  Platform,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
  Image,
  Alert,
  ScrollView,
  AppState,
  AppStateStatus,
} from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import ImageView from 'react-native-image-viewing';
import { VStack, Heading, Text, Center, Avatar, AvatarFallbackText, HStack, Spinner, Box } from '@gluestack-ui/themed';
import { useTranslation } from 'react-i18next';
import { Send, Paperclip, X, Video as VideoIcon, Camera, Check, CheckCheck } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { useSocket } from '../../src/hooks/useSocket';
import { useSocketEvent } from '../../src/hooks/useSocketEvent';
import { client } from '../../src/api/client';
import { useAuth } from '../../src/contexts/AuthContext';
import { format, isToday, isYesterday, isSameDay } from 'date-fns';
import * as ImagePicker from 'expo-image-picker';
import { useVideoPlayer, VideoView } from 'expo-video';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { uploadToS3 } from '../../src/api/upload';
import { isVideoFile } from '../../src/utils/file';
import { ChatMessage } from '@repo/types';

const VideoAttachment = ({ url, style }: { url: string; style: any }) => {
  const player = useVideoPlayer({ uri: url, useCaching: true }, player => {
    player.loop = false;
  });

  return (
    <VideoView
      style={style}
      player={player}
      fullscreenOptions={{ enable: true }}
      allowsPictureInPicture
      nativeControls={true}
      contentFit="contain"
    />
  );
};

export default function ChatScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const auth = useAuth();
  const { socket } = useSocket();

  const [inputText, setInputText] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const isFocusedRef = useRef(false);
  const [selectedAttachments, setSelectedAttachments] = useState<ImagePicker.ImagePickerAsset[]>([]);
  const [isUploading, setIsUploading] = useState(false);

  // Lightbox state
  const [isViewerVisible, setIsViewerVisible] = useState(false);
  const [viewerImages, setViewerImages] = useState<{ uri: string }[]>([]);
  const [currentVisibleDate, setCurrentVisibleDate] = useState<string | null>(null);
  const [viewerIndex, setViewerIndex] = useState(0);

  const flatListRef = useRef<FlatList>(null);

  const employeeInfo = auth.isAuthenticated ? auth.user : null;
  const employeeId = employeeInfo?.id;

  // Fetch messages with TanStack Query (Infinite Query for pagination)
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading } = useInfiniteQuery({
    queryKey: ['chat', 'messages', employeeId],
    queryFn: async ({ pageParam }) => {
      if (!auth.isAuthenticated) throw new Error('Not authenticated');
      const response = await client.get(`/api/shared/chat/${auth.user.id}`, {
        params: {
          limit: 15,
          cursor: pageParam,
        },
      });
      return response.data as ChatMessage[];
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: lastPage => {
      if (lastPage.length < 15) return undefined;
      return lastPage[lastPage.length - 1].id;
    },
    enabled: !!employeeId,
  });

  const messages = useMemo(() => data?.pages.flat() || [], [data]);

  const messagesWithDates = useMemo(() => {
    if (messages.length === 0) return [];

    const result: (ChatMessage | { type: 'date'; date: string; id: string })[] = [];
    for (let i = 0; i < messages.length; i++) {
      const current = messages[i];
      const next = messages[i + 1];

      result.push(current);

      if (!next || !isSameDay(new Date(current.createdAt), new Date(next.createdAt))) {
        result.push({
          type: 'date',
          date: current.createdAt,
          id: `date-${current.id}`,
        });
      }
    }
    return result;
  }, [messages]);

  // Mark existing unread messages as read when focused or when messages are loaded while focused
  useEffect(() => {
    if (isFocused && messages.length > 0 && socket && employeeId) {
      const unreadIds = messages.filter(m => m.sender === 'admin' && !m.readAt).map(m => m.id);

      if (unreadIds.length > 0) {
        socket.emit('mark_read', {
          employeeId,
          messageIds: unreadIds,
        });
      }
    }
  }, [isFocused, messages, employeeId, socket]);

  // Track tab focus (for tab navigation)
  useFocusEffect(
    useCallback(() => {
      setIsFocused(true);
      isFocusedRef.current = true;
      return () => {
        setIsFocused(false);
        isFocusedRef.current = false;
      };
    }, [])
  );

  // Track app state (for minimize/resume)
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextAppState: AppStateStatus) => {
      const isActive = nextAppState === 'active';

      // When app becomes active, refetch messages to sync
      if (isActive && employeeId) {
        queryClient.invalidateQueries({ queryKey: ['chat', 'messages', employeeId] });
        queryClient.invalidateQueries({ queryKey: ['chat', 'unread'] });
      }
    });

    return () => {
      subscription.remove();
    };
  }, [employeeId, queryClient]);

  // Socket Events
  useSocketEvent('new_message', message => {
    if (!employeeId) return;

    // Update message list cache
    queryClient.setQueryData(['chat', 'messages', employeeId], (old: any) => {
      if (!old) return old;

      // Prevent duplicate messages (especially when sending from this client)
      const exists = old.pages.some((page: ChatMessage[]) => page.some(m => m.id === message.id));
      if (exists) return old;

      return {
        ...old,
        pages: [[message, ...old.pages[0]], ...old.pages.slice(1)],
      };
    });

    // If we are currently looking at the chat, mark it as read immediately
    if (isFocusedRef.current && message.sender === 'admin' && socket) {
      socket.emit('mark_read', {
        employeeId,
        messageIds: [message.id],
      });
    }

    // Invalidate unread count query
    queryClient.invalidateQueries({ queryKey: ['chat', 'unread'] });
  });

  useSocketEvent('messages_read', data => {
    if (!employeeId) return;

    // Update messages in cache to show read status
    queryClient.setQueryData(['chat', 'messages', employeeId], (old: any) => {
      if (!old) return old;
      return {
        ...old,
        pages: old.pages.map((page: ChatMessage[]) =>
          page.map(msg => (data.messageIds?.includes(msg.id) ? { ...msg, readAt: new Date().toISOString() } : msg))
        ),
      };
    });

    // Invalidate unread count query
    queryClient.invalidateQueries({ queryKey: ['chat', 'unread'] });
  });

  const pickAttachments = async () => {
    if (selectedAttachments.length >= 4) {
      Alert.alert(t('chat.limit_reached'), t('chat.limit_reached_desc'));
      return;
    }

    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images', 'videos'],
        allowsMultipleSelection: true,
        selectionLimit: 4 - selectedAttachments.length,
        quality: 0.7,
      });

      if (!result.canceled) {
        setSelectedAttachments([...selectedAttachments, ...result.assets].slice(0, 4));
      }
    } catch (error) {
      console.error('Error picking attachments:', error);
      Alert.alert(t('chat.pick_error'), t('chat.pick_error_desc'));
    }
  };

  const takePhoto = async () => {
    if (selectedAttachments.length >= 4) {
      Alert.alert(t('chat.limit_reached'), t('chat.limit_reached_desc'));
      return;
    }

    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(t('chat.camera_permission'), t('chat.camera_permission_desc'));
      return;
    }

    try {
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images', 'videos'],
        quality: 0.7,
      });

      if (!result.canceled) {
        setSelectedAttachments([...selectedAttachments, ...result.assets].slice(0, 4));
      }
    } catch (error) {
      console.error('Error taking photo:', error);
      Alert.alert(t('chat.camera_error'), t('chat.camera_error_desc'));
    }
  };

  const removeAttachment = (index: number) => {
    const newAttachments = [...selectedAttachments];
    newAttachments.splice(index, 1);
    setSelectedAttachments(newAttachments);
  };

  const sendMessage = async () => {
    if ((!inputText.trim() && selectedAttachments.length === 0) || !socket || isUploading) return;

    setIsUploading(true);
    try {
      let attachmentKeys: string[] = [];

      if (selectedAttachments.length > 0) {
        const uploadPromises = selectedAttachments.map(async asset => {
          const fileName = asset.fileName || `file_${Date.now()}.${asset.uri.split('.').pop()}`;
          const mimeType = asset.mimeType || (asset.type === 'video' ? 'video/mp4' : 'image/jpeg');
          const response = await uploadToS3(asset.uri, fileName, mimeType, asset.fileSize || 0, 'chat');
          return response.key;
        });

        attachmentKeys = await Promise.all(uploadPromises);
      }

      socket.emit('send_message', {
        content: inputText.trim(),
        attachments: attachmentKeys,
      });

      setInputText('');
      setSelectedAttachments([]);
    } catch (error) {
      console.error('Error sending message:', error);
      Alert.alert(t('chat.send_error'), t('chat.send_error_desc'));
    } finally {
      setIsUploading(false);
    }
  };

  const openImageViewer = (attachments: string[], index: number) => {
    const images = attachments.filter(url => !isVideoFile(url)).map(url => ({ uri: url }));
    if (images.length === 0) return;

    // Find the index of the clicked image in the filtered images list
    const filteredIndex = images.findIndex(img => img.uri === attachments[index]);

    setViewerImages(images);
    setViewerIndex(filteredIndex >= 0 ? filteredIndex : 0);
    setIsViewerVisible(true);
  };

  const renderItem = ({ item }: { item: ChatMessage | { type: 'date'; date: string; id: string } }) => {
    if ('type' in item && item.type === 'date') {
      let dateLabel = format(new Date(item.date), 'MMM d, yyyy');
      if (isToday(new Date(item.date))) dateLabel = t('chat.today');
      else if (isYesterday(new Date(item.date))) dateLabel = t('chat.yesterday');

      return (
        <Center my="$4">
          <BlurView intensity={20} tint="light" style={styles.dateSeparator}>
            <Text style={styles.dateText}>{dateLabel}</Text>
          </BlurView>
        </Center>
      );
    }

    const message = item as ChatMessage;
    const isMe = message.sender === 'employee';
    return (
      <View style={[styles.messageContainer, isMe ? styles.myMessage : styles.theirMessage]}>
        {!isMe && (
          <Avatar size="xs" bgColor="$blue600" mr="$2" mt="$1">
            <AvatarFallbackText>{message.admin?.name || 'A'}</AvatarFallbackText>
          </Avatar>
        )}
        <VStack style={isMe ? styles.myVStack : styles.theirVStack}>
          {!isMe && <Text style={styles.senderName}>{message.admin?.name || 'Admin'}</Text>}
          <BlurView
            intensity={isMe ? 40 : 25}
            tint={isMe ? 'dark' : 'light'}
            style={[styles.messageBubble, isMe ? styles.myBubble : styles.theirBubble]}
          >
            {isMe && (
              <LinearGradient
                colors={['rgba(239, 68, 68, 0.15)', 'transparent']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={StyleSheet.absoluteFill}
              />
            )}
            {message.attachments && message.attachments.length > 0 && (
              <View style={styles.attachmentsContainer}>
                {message.attachments.map((url, i) => {
                  const isVideo = isVideoFile(url);
                  return (
                    <View key={i} style={styles.attachmentWrapper}>
                      {isVideo ? (
                        <VideoAttachment
                          url={url}
                          style={[
                            styles.attachmentImage,
                            message.attachments.length > 1 && styles.multiAttachmentImage,
                          ]}
                        />
                      ) : (
                        <TouchableOpacity onPress={() => openImageViewer(message.attachments, i)}>
                          <Image
                            source={{ uri: url }}
                            style={[
                              styles.attachmentImage,
                              message.attachments.length > 1 && styles.multiAttachmentImage,
                            ]}
                            resizeMode="cover"
                          />
                        </TouchableOpacity>
                      )}
                    </View>
                  );
                })}
              </View>
            )}
            <Text style={[styles.messageText, isMe ? styles.myText : styles.theirText]}>{message.content}</Text>
            <HStack space="xs" justifyContent="flex-end" alignItems="center" mt="$1">
              <Text style={[styles.messageTime, isMe ? styles.myTime : styles.theirTime]}>
                {format(new Date(message.createdAt), 'HH:mm')}
              </Text>
              {isMe && (
                <View style={styles.readStatusContainer}>
                  {message.readAt ? <CheckCheck size={12} color="#EF4444" /> : <Check size={12} color="#6B7280" />}
                </View>
              )}
            </HStack>
          </BlurView>
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
    <View style={{ flex: 1, backgroundColor: '#121212' }}>
      <LinearGradient
        colors={['rgba(37, 99, 235, 0.05)', 'transparent']}
        style={[StyleSheet.absoluteFill, { height: '40%' }]}
      />
      {/* Header */}
      <BlurView intensity={40} tint="dark" style={{ paddingTop: insets.top }}>
        <HStack px="$4" py="$3" alignItems="center" justifyContent="space-between">
          <HStack space="md" alignItems="center">
            <View style={styles.headerLogo}>
              <Text style={styles.headerLogoText}>E</Text>
            </View>
            <VStack>
              <Heading size="md" color="white">
                {t('chat.title')}
              </Heading>
              <HStack space="xs" alignItems="center">
                <View style={styles.statusDot} />
                <Text size="xs" color="$emerald500" bold>
                  {t('chat.status_active').toUpperCase()}
                </Text>
              </HStack>
            </VStack>
          </HStack>
        </HStack>
        <View style={styles.headerDivider} />
      </BlurView>

      <KeyboardAvoidingView
        behavior="padding"
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
        style={{ flex: 1 }}
      >
        <View style={{ flex: 1 }}>
          <FlatList
            ref={flatListRef}
            data={messagesWithDates}
            inverted
            keyExtractor={item => item.id}
            renderItem={renderItem}
            contentContainerStyle={{ padding: 16, flexGrow: 1 }}
            style={{ flex: 1 }}
            onEndReached={() => {
              if (hasNextPage && !isFetchingNextPage) {
                fetchNextPage();
              }
            }}
            onEndReachedThreshold={0.5}
            ListFooterComponent={() =>
              isFetchingNextPage ? (
                <View style={{ padding: 10 }}>
                  <Spinner size="small" />
                </View>
              ) : null
            }
            onViewableItemsChanged={({ viewableItems }) => {
              if (viewableItems.length > 0) {
                // Find the last item (which is actually the top item in inverted list)
                // or simply the first viewable item that has a date
                const topItem = viewableItems[viewableItems.length - 1]; // Inverted list, last item is top
                if (topItem && topItem.item) {
                  const item = topItem.item as any;
                  const date = item.createdAt || item.date;
                  if (date) {
                    let dateLabel = format(new Date(date), 'MMM d, yyyy');
                    if (isToday(new Date(date))) dateLabel = t('chat.today');
                    else if (isYesterday(new Date(date))) dateLabel = t('chat.yesterday');

                    if (currentVisibleDate !== dateLabel) {
                      setCurrentVisibleDate(dateLabel);
                    }
                  }
                }
              }
            }}
            viewabilityConfig={{
              itemVisiblePercentThreshold: 10,
            }}
          />

          {/* Sticky Date Pill */}
          {currentVisibleDate && (
            <View style={styles.stickyDateContainer} pointerEvents="none">
              <BlurView intensity={20} tint="dark" style={styles.stickyDateBlur}>
                <Text style={styles.stickyDateText}>{currentVisibleDate}</Text>
              </BlurView>
            </View>
          )}
        </View>

        {/* Selected Attachments Preview */}
        {selectedAttachments.length > 0 && (
          <View style={styles.previewsContainer}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {selectedAttachments.map((asset, index) => (
                <View key={index} style={styles.previewItem}>
                  {asset.type === 'video' ? (
                    <Box style={styles.previewMedia} bgColor="$gray800" justifyContent="center" alignItems="center">
                      <VideoIcon size={24} color="#6B7280" />
                    </Box>
                  ) : (
                    <Image source={{ uri: asset.uri }} style={styles.previewMedia} />
                  )}
                  <TouchableOpacity style={styles.removePreviewButton} onPress={() => removeAttachment(index)}>
                    <X size={12} color="white" />
                  </TouchableOpacity>
                </View>
              ))}
            </ScrollView>
          </View>
        )}

        {/* Input Area */}
        <View style={styles.inputContainerWrapper}>
          <BlurView intensity={60} tint="dark" style={styles.inputBlurContainer}>
            <HStack space="xs" alignItems="center">
              <TouchableOpacity onPress={pickAttachments} disabled={isUploading} style={styles.attachButton}>
                <Paperclip size={22} color="#94A3B8" />
              </TouchableOpacity>
              <TouchableOpacity onPress={takePhoto} disabled={isUploading} style={styles.attachButton}>
                <Camera size={22} color="#94A3B8" />
              </TouchableOpacity>
              <TextInput
                style={styles.input}
                placeholder={t('chat.placeholder')}
                placeholderTextColor="#64748B"
                value={inputText}
                onChangeText={setInputText}
                multiline
                editable={!isUploading}
              />

              <TouchableOpacity
                onPress={sendMessage}
                disabled={(!inputText.trim() && selectedAttachments.length === 0) || isUploading}
              >
                <LinearGradient
                  colors={['#EF4444', '#991B1B']}
                  style={[
                    styles.sendButton,
                    ((!inputText.trim() && selectedAttachments.length === 0) || isUploading) &&
                      styles.sendButtonDisabled,
                  ]}
                >
                  {isUploading ? <Spinner color="white" size="small" /> : <Send size={18} color="white" />}
                </LinearGradient>
              </TouchableOpacity>
            </HStack>
          </BlurView>
          <View style={{ height: insets.bottom + 8 }} />
        </View>
      </KeyboardAvoidingView>

      <ImageView
        images={viewerImages}
        imageIndex={viewerIndex}
        visible={isViewerVisible}
        onRequestClose={() => setIsViewerVisible(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  messageContainer: {
    flexDirection: 'row',
    marginBottom: 20,
    maxWidth: '85%',
  },
  myMessage: {
    alignSelf: 'flex-end',
    flexDirection: 'row-reverse',
  },
  theirMessage: {
    alignSelf: 'flex-start',
  },
  myVStack: {
    alignItems: 'flex-end',
  },
  theirVStack: {
    alignItems: 'flex-start',
  },
  messageBubble: {
    padding: 12,
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  myBubble: {
    backgroundColor: 'rgba(60, 20, 20, 0.4)',
    borderBottomRightRadius: 4,
    shadowColor: '#EF4444',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 2,
  },
  theirBubble: {
    backgroundColor: 'rgba(40, 40, 40, 0.6)',
    borderBottomLeftRadius: 4,
  },
  messageText: {
    fontSize: 15,
    lineHeight: 20,
  },
  myText: {
    color: 'white',
  },
  theirText: {
    color: '#E2E8F0',
  },
  senderName: {
    fontSize: 10,
    color: '#94A3B8',
    marginBottom: 4,
    marginLeft: 4,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  messageTime: {
    fontSize: 10,
  },
  myTime: {
    color: 'rgba(255, 255, 255, 0.5)',
  },
  theirTime: {
    color: '#64748B',
  },
  readStatusContainer: {
    marginLeft: 2,
  },
  inputContainerWrapper: {
    paddingHorizontal: 16,
    paddingTop: 10,
  },
  inputBlurContainer: {
    borderRadius: 30,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 5,
  },
  input: {
    flex: 1,
    color: 'white',
    paddingHorizontal: 12,
    paddingVertical: 8,
    maxHeight: 120,
    fontSize: 15,
  },
  attachButton: {
    padding: 8,
  },
  sendButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 2,
  },
  sendButtonDisabled: {
    opacity: 0.5,
  },
  attachmentsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 10,
    width: 220,
  },
  attachmentWrapper: {
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  attachmentImage: {
    width: 220,
    height: 160,
  },
  multiAttachmentImage: {
    width: 107,
    height: 107,
  },
  previewsContainer: {
    padding: 8,
    marginHorizontal: 16,
    marginBottom: 8,
    borderRadius: 16,
    backgroundColor: 'rgba(30,30,30,0.8)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  previewItem: {
    marginRight: 10,
    position: 'relative',
  },
  previewMedia: {
    width: 64,
    height: 64,
    borderRadius: 10,
  },
  removePreviewButton: {
    position: 'absolute',
    top: -6,
    right: -6,
    backgroundColor: '#EF4444',
    borderRadius: 10,
    width: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#121212',
  },
  dateSeparator: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
    overflow: 'hidden',
  },
  dateText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#94A3B8',
    textTransform: 'uppercase',
  },
  headerLogo: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#991B1B',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  headerLogoText: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 18,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#10B981',
  },
  headerDivider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.05)',
    marginTop: 8,
  },
  stickyDateContainer: {
    position: 'absolute',
    top: 10,
    alignSelf: 'center',
    borderRadius: 20,
    overflow: 'hidden',
    zIndex: 10,
  },
  stickyDateBlur: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    backgroundColor: 'rgba(30, 30, 30, 0.6)',
  },
  stickyDateText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#94A3B8',
    textTransform: 'uppercase',
  },
});
