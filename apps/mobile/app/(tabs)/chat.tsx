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
import { Send, Paperclip, X, Video as VideoIcon, Camera } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { useSocket } from '../../src/hooks/useSocket';
import { useSocketEvent } from '../../src/hooks/useSocketEvent';
import { client } from '../../src/api/client';
import { useAuth } from '../../src/contexts/AuthContext';
import { format } from 'date-fns';
import * as ImagePicker from 'expo-image-picker';
import { useVideoPlayer, VideoView } from 'expo-video';
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
      Alert.alert(
        t('chat.limit_reached', 'Limit reached'),
        t('chat.limit_reached_desc', 'You can only attach up to 4 files.')
      );
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
      Alert.alert(t('chat.pick_error', 'Error'), t('chat.pick_error_desc', 'Failed to pick files.'));
    }
  };

  const takePhoto = async () => {
    if (selectedAttachments.length >= 4) {
      Alert.alert(
        t('chat.limit_reached', 'Limit reached'),
        t('chat.limit_reached_desc', 'You can only attach up to 4 files.')
      );
      return;
    }

    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(
        t('chat.camera_permission', 'Permission required'),
        t('chat.camera_permission_desc', 'We need camera permission to take photos.')
      );
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
      Alert.alert(t('chat.camera_error', 'Error'), t('chat.camera_error_desc', 'Failed to take photo.'));
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
      Alert.alert(t('chat.send_error', 'Error'), t('chat.send_error_desc', 'Failed to send message.'));
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

  const renderItem = ({ item }: { item: ChatMessage }) => {
    const isMe = item.sender === 'employee';
    return (
      <View style={[styles.messageContainer, isMe ? styles.myMessage : styles.theirMessage]}>
        {!isMe && (
          <Avatar size="xs" bgColor="$blue600" mr="$2">
            <AvatarFallbackText>{item.admin?.name || 'A'}</AvatarFallbackText>
          </Avatar>
        )}
        <VStack style={[styles.messageBubble, isMe ? styles.myBubble : styles.theirBubble]}>
          {item.attachments && item.attachments.length > 0 && (
            <View style={styles.attachmentsContainer}>
              {item.attachments.map((url, i) => {
                const isVideo = isVideoFile(url);
                return (
                  <View key={i} style={styles.attachmentWrapper}>
                    {isVideo ? (
                      <VideoAttachment
                        url={url}
                        style={[styles.attachmentImage, item.attachments.length > 1 && styles.multiAttachmentImage]}
                      />
                    ) : (
                      <TouchableOpacity onPress={() => openImageViewer(item.attachments, i)}>
                        <Image
                          source={{ uri: url }}
                          style={[styles.attachmentImage, item.attachments.length > 1 && styles.multiAttachmentImage]}
                          resizeMode="cover"
                        />
                      </TouchableOpacity>
                    )}
                  </View>
                );
              })}
            </View>
          )}
          <Text style={[styles.messageText, isMe ? styles.myText : styles.theirText]}>{item.content}</Text>
          <Text style={[styles.messageTime, isMe ? styles.myTime : styles.theirTime]}>
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
        behavior="padding"
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
        style={{ flex: 1 }}
      >
        <View style={{ flex: 1 }}>
          <FlatList
            ref={flatListRef}
            data={messages}
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
          />
        </View>

        {/* Selected Attachments Preview */}
        {selectedAttachments.length > 0 && (
          <View style={styles.previewsContainer}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {selectedAttachments.map((asset, index) => (
                <View key={index} style={styles.previewItem}>
                  {asset.type === 'video' ? (
                    <Box style={styles.previewMedia} bgColor="$gray200" justifyContent="center" alignItems="center">
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
        <View
          style={{
            backgroundColor: 'white',
            borderTopWidth: 1,
            borderColor: '#E5E7EB',
            paddingHorizontal: 16,
            paddingTop: 8,
            paddingBottom: insets.bottom + 8,
          }}
        >
          <HStack space="xs" alignItems="center">
            <TouchableOpacity onPress={pickAttachments} disabled={isUploading} style={styles.attachButton}>
              <Paperclip size={24} color="#6B7280" />
            </TouchableOpacity>
            <TouchableOpacity onPress={takePhoto} disabled={isUploading} style={styles.attachButton}>
              <Camera size={24} color="#6B7280" />
            </TouchableOpacity>
            <TextInput
              style={styles.input}
              placeholder={t('chat.placeholder', 'Type a message...')}
              value={inputText}
              onChangeText={setInputText}
              multiline
              editable={!isUploading}
            />

            <TouchableOpacity
              onPress={sendMessage}
              disabled={(!inputText.trim() && selectedAttachments.length === 0) || isUploading}
              style={[
                styles.sendButton,
                ((!inputText.trim() && selectedAttachments.length === 0) || isUploading) && styles.sendButtonDisabled,
              ]}
            >
              {isUploading ? <Spinner color="white" size="small" /> : <Send size={20} color="white" />}
            </TouchableOpacity>
          </HStack>
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
  attachButton: {
    padding: 4,
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
  attachmentWrapper: {
    borderRadius: 8,
    overflow: 'hidden',
  },
  attachmentImage: {
    width: 200,
    height: 150,
  },
  multiAttachmentImage: {
    width: 98,
    height: 98,
  },
  previewsContainer: {
    backgroundColor: 'white',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderColor: '#F3F4F6',
  },
  previewItem: {
    marginRight: 12,
    position: 'relative',
  },
  previewMedia: {
    width: 60,
    height: 60,
    borderRadius: 8,
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
    borderColor: 'white',
  },
});
