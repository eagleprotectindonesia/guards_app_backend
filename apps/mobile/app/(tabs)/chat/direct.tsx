import React, { useCallback, useMemo, useRef, useState } from 'react';
import { BackHandler, FlatList, Platform, StyleSheet, View, ViewToken } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import ImageView from 'react-native-image-viewing';
import { Text } from '@/components/ui/text';
import { Spinner } from '@/components/ui/spinner';
import { Center } from '@/components/ui/center';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { useRouter } from 'expo-router';
import { useSocket } from '../../../src/hooks/useSocket';
import { useAuth } from '../../../src/contexts/AuthContext';
import { useCustomToast } from '../../../src/hooks/useCustomToast';
import { reserveChatDraft, uploadToS3 } from '../../../src/api/upload';
import { isVideoFile } from '../../../src/utils/file';
import { optimizeImage } from '../../../src/utils/imageOptimization';
import { useActiveShift } from '../../../src/hooks/useActiveShift';
import { ChatListItem, ChatListItemData } from '../../../src/components/chat/ChatListItem';
import { ChatHeader } from '../../../src/components/chat/ChatHeader';
import { ChatComposer } from '../../../src/components/chat/ChatComposer';
import { useChatMessages } from '../../../src/hooks/useChatMessages';
import { SendMessageAck } from '@repo/types';

const MAX_CHAT_VIDEO_SIZE_BYTES = 20 * 1024 * 1024;
const SEND_TIMEOUT = 20000;

type PendingEntry = {
  clientId: string;
  status: 'sending' | 'failed';
  content: string;
  attachments: ImagePicker.ImagePickerAsset[];
  latitude?: number;
  longitude?: number;
  createdAt: string;
};

export default function ChatScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { socket } = useSocket();
  const router = useRouter();
  const auth = useAuth();
  const toast = useCustomToast();
  const { isOnActiveShift } = useActiveShift();

  const [inputText, setInputText] = useState('');
  const [selectedAttachments, setSelectedAttachments] = useState<ImagePicker.ImagePickerAsset[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isViewerVisible, setIsViewerVisible] = useState(false);
  const [viewerImages, setViewerImages] = useState<{ uri: string }[]>([]);
  const [viewerIndex, setViewerIndex] = useState(0);
  const [currentVisibleDate, setCurrentVisibleDate] = useState<string | null>(null);
  const [pendingEntries, setPendingEntries] = useState<PendingEntry[]>([]);

  const flatListRef = useRef<FlatList>(null);
  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 10 }).current;
  const clientIdCounter = useRef(0);

  const employeeId = auth.user?.id;

  useFocusEffect(
    useCallback(() => {
      if (Platform.OS !== 'android') return undefined;

      const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
        router.replace('/(tabs)/chat');
        return true;
      });

      return () => subscription.remove();
    }, [router])
  );

  const {
    messages,
    messagesWithDates,
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    getDateLabel,
    onViewableItemsChanged: getVisibleDateLabel,
  } = useChatMessages({
    employeeId,
    isAuthenticated: auth.isAuthenticated,
    socket,
    t,
  });

  const displayData = useMemo<ChatListItemData[]>(() => {
    const pendingItems: ChatListItemData[] = pendingEntries.map(e => ({
      type: e.status === 'sending' ? 'pending' as const : 'failed' as const,
      id: e.clientId,
      content: e.content,
      attachmentUris: e.attachments.map(a => a.uri),
      createdAt: e.createdAt,
    }));
    return [...pendingItems, ...messagesWithDates];
  }, [pendingEntries, messagesWithDates]);

  const addAttachments = useCallback(
    (assets: ImagePicker.ImagePickerAsset[]) => {
      const validAssets = assets.filter(asset => {
        const isVideo = asset.type === 'video';
        const fileSize = asset.fileSize ?? 0;
        return !isVideo || fileSize === 0 || fileSize <= MAX_CHAT_VIDEO_SIZE_BYTES;
      });

      if (validAssets.length < assets.length) {
        toast.warning(t('chat.video_size_limit'), t('chat.video_size_limit_desc'));
      }

      if (validAssets.length > 0) {
        setSelectedAttachments(prev => [...prev, ...validAssets].slice(0, 4));
      }
    },
    [t, toast]
  );

  const pickAttachments = async () => {
    if (selectedAttachments.length >= 4) {
      toast.warning(t('chat.limit_reached'), t('chat.limit_reached_desc'));
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
        addAttachments(result.assets);
      }
    } catch (error) {
      console.error('Error picking attachments:', error);
      toast.error(t('chat.pick_error'), t('chat.pick_error_desc'));
    }
  };

  const takePhoto = async () => {
    if (selectedAttachments.length >= 4) {
      toast.warning(t('chat.limit_reached'), t('chat.limit_reached_desc'));
      return;
    }

    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      toast.error(t('chat.camera_permission'), t('chat.camera_permission_desc'));
      return;
    }

    try {
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
        quality: 0.7,
      });

      if (!result.canceled) {
        addAttachments(result.assets);
      }
    } catch (error) {
      console.error('Error taking photo:', error);
      toast.error(t('chat.camera_error'), t('chat.camera_error_desc'));
    }
  };

  const recordVideo = async () => {
    if (selectedAttachments.length >= 4) {
      toast.warning(t('chat.limit_reached'), t('chat.limit_reached_desc'));
      return;
    }

    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      toast.error(t('chat.camera_permission'), t('chat.camera_permission_desc'));
      return;
    }

    try {
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['videos'],
        quality: 0.7,
      });

      if (!result.canceled) {
        addAttachments(result.assets);
      }
    } catch (error) {
      console.error('Error recording video:', error);
      toast.error(t('chat.camera_error'), t('chat.camera_error_desc'));
    }
  };

  const shareLocation = async () => {
    if (isUploading) return;
    try {
      setIsUploading(true);
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        toast.error(
          t('chat.location_permission', 'Permission denied'),
          t('chat.location_permission_desc', 'Cannot access location.')
        );
        return;
      }
      const location = await Location.getCurrentPositionAsync({});
      if (socket) {
        const ack = await socket.timeout(SEND_TIMEOUT).emitWithAck('send_message', {
          content: '',
          attachments: [],
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
        }) as SendMessageAck;

        if (!ack.success) {
          toast.error(t('chat.send_error', 'Send failed'), ack.error);
        }
      }
    } catch (error) {
      console.error('Error sharing location:', error);
      toast.error(
        t('chat.location_error', 'Location error'),
        t('chat.location_error_desc', 'Unable to fetch your location.')
      );
    } finally {
      setIsUploading(false);
    }
  };

  const removeAttachment = useCallback((index: number) => {
    setSelectedAttachments(prev => prev.filter((_, i) => i !== index));
  }, []);

  const sendMessage = useCallback(async (retryEntry?: PendingEntry) => {
    const content = retryEntry?.content ?? inputText.trim();
    const attachments = retryEntry?.attachments ?? selectedAttachments;
    const hasContent = content.length > 0 || attachments.length > 0;

    if (!hasContent || !socket) return;
    if (!retryEntry && isUploading) return;

    const clientId = retryEntry?.clientId ?? `${Date.now()}-${clientIdCounter.current++}`;

    if (!retryEntry) {
      setPendingEntries(prev => [...prev, {
        clientId,
        status: 'sending',
        content,
        attachments,
        latitude: undefined,
        longitude: undefined,
        createdAt: new Date().toISOString(),
      }]);
    } else {
      setPendingEntries(prev => prev.map(e => e.clientId === clientId ? { ...e, status: 'sending' } : e));
    }

    setIsUploading(true);
    try {
      let latitude: number | undefined = retryEntry?.latitude;
      let longitude: number | undefined = retryEntry?.longitude;
      const hasImages = attachments.some(a => a.type === 'image');

      if (!retryEntry?.latitude && hasImages && attachments.length > 0 && isOnActiveShift) {
        const permStatus = await Location.requestForegroundPermissionsAsync();
        if (permStatus.status !== 'granted') {
          setPendingEntries(prev => prev.map(e => e.clientId === clientId ? { ...e, status: 'failed' } : e));
          toast.error(
            t('chat.location_required', 'Location required'),
            t('chat.location_required_desc', 'Location permission is needed to send photos during an active shift.')
          );
          return;
        }
        try {
          const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
          latitude = loc.coords.latitude;
          longitude = loc.coords.longitude;
        } catch {
          setPendingEntries(prev => prev.map(e => e.clientId === clientId ? { ...e, status: 'failed' } : e));
          toast.error(
            t('chat.location_unavailable', 'Location unavailable'),
            t('chat.location_unavailable_desc', 'Could not get your current location. Please ensure GPS is enabled.')
          );
          return;
        }
      }

      let attachmentKeys: string[] = [];
      let messageId: string | undefined;

      if (attachments.length > 0) {
        if (!employeeId) {
          throw new Error('Employee ID is required to reserve a chat draft');
        }

        const draft = await reserveChatDraft(employeeId);
        messageId = draft.messageId;

        const uploadPromises = attachments.map(async asset => {
          const fileType = asset.type === 'video' ? 'video' : 'image';
          let uploadUri = asset.uri;
          let uploadFileName: string;
          let uploadMimeType: string;
          let uploadFileSize = asset.fileSize || 0;

          if (asset.type === 'image') {
            const optimized = await optimizeImage(asset);
            uploadUri = optimized.uri;
            uploadFileName = optimized.fileName;
            uploadMimeType = optimized.mimeType;
            uploadFileSize = optimized.fileSize;
          } else {
            uploadFileName = asset.fileName || `file_${Date.now()}.${asset.uri.split('.').pop()}`;
            uploadMimeType = asset.mimeType || 'video/mp4';
          }

          const response = await uploadToS3(uploadUri, uploadFileName, uploadMimeType, uploadFileSize, {
            folder: 'chat',
            conversationId: employeeId,
            messageId,
            fileType,
          });
          return response.key;
        });

        attachmentKeys = await Promise.all(uploadPromises);
      }

      const ack = await socket.timeout(SEND_TIMEOUT).emitWithAck('send_message', {
        content,
        messageId,
        attachments: attachmentKeys,
        latitude,
        longitude,
      }) as SendMessageAck;

      if (ack.success) {
        setPendingEntries(prev => prev.filter(e => e.clientId !== clientId));
        if (!retryEntry) {
          setInputText('');
          setSelectedAttachments([]);
        }
      } else {
        setPendingEntries(prev => prev.map(e => e.clientId === clientId ? { ...e, status: 'failed' } : e));
        toast.error(t('chat.send_error'), ack.error || t('chat.send_error_desc'));
      }
    } catch (error) {
      console.error('Error sending message:', error);
      setPendingEntries(prev => prev.map(e => e.clientId === clientId ? { ...e, status: 'failed' } : e));
      toast.error(t('chat.send_error'), t('chat.send_error_desc'));
    } finally {
      setIsUploading(false);
    }
  }, [socket, selectedAttachments, inputText, isUploading, employeeId, isOnActiveShift, t, toast]);

  const retryMessage = useCallback((clientId: string) => {
    const entry = pendingEntries.find(e => e.clientId === clientId);
    if (entry && entry.status === 'failed') {
      sendMessage(entry);
    }
  }, [pendingEntries, sendMessage]);

  const openImageViewer = useCallback((attachments: string[], index: number) => {
    const isVideoAtIndex = attachments[index] ? isVideoFile(attachments[index]) : false;
    if (isVideoAtIndex) return;
    const images = attachments.filter(url => !isVideoFile(url)).map(url => ({ uri: url }));
    if (images.length === 0) return;

    const filteredIndex = images.findIndex(img => img.uri === attachments[index]);

    setViewerImages(images);
    setViewerIndex(filteredIndex >= 0 ? filteredIndex : 0);
    setIsViewerVisible(true);
  }, []);

  const renderItem = useCallback(
    ({ item }: { item: ChatListItemData }) => (
      <ChatListItem item={item} getDateLabel={getDateLabel} onOpenImageViewer={openImageViewer} onRetryMessage={retryMessage} />
    ),
    [getDateLabel, openImageViewer, retryMessage]
  );

  const keyExtractor = useCallback((item: ChatListItemData) => item.id, []);
  const renderFooter = useCallback(
    () =>
      isFetchingNextPage ? (
        <View style={{ padding: 10 }}>
          <Spinner size="small" />
        </View>
      ) : null,
    [isFetchingNextPage]
  );

  const handleViewableItemsChanged = useCallback(
    (info: { viewableItems: ViewToken[] }) => {
      const label = getVisibleDateLabel({ viewableItems: info.viewableItems });
      if (label) {
        setCurrentVisibleDate(prev => (prev === label ? prev : label));
      }
    },
    [getVisibleDateLabel]
  );

  if (isLoading && messages.length === 0) {
    return (
      <Center className="flex-1">
        <Spinner size="large" />
      </Center>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#121212' }}>
      <LinearGradient
        colors={['rgba(255, 255, 255, 0.05)', 'transparent']}
        style={[StyleSheet.absoluteFill, { height: '40%' }]}
      />
      <ChatHeader
        topInset={insets.top}
        title={t('chat.admin_support', 'Admin Support')}
        statusText={t('chat.status_active').toUpperCase()}
        onBackPress={() => router.replace('/(tabs)/chat')}
      />

      <KeyboardAvoidingView
        behavior="padding"
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
        style={{ flex: 1 }}
      >
        <View style={{ flex: 1 }}>
          <FlatList
            ref={flatListRef}
            data={displayData}
            inverted
            keyExtractor={keyExtractor}
            renderItem={renderItem}
            windowSize={9}
            initialNumToRender={20}
            maxToRenderPerBatch={10}
            removeClippedSubviews={Platform.OS === 'android'}
            contentContainerStyle={{ padding: 16, flexGrow: 1 }}
            style={{ flex: 1 }}
            onEndReached={() => {
              if (hasNextPage && !isFetchingNextPage) {
                fetchNextPage();
              }
            }}
            onEndReachedThreshold={0.5}
            ListFooterComponent={renderFooter}
            onViewableItemsChanged={handleViewableItemsChanged}
            viewabilityConfig={viewabilityConfig}
          />

          {currentVisibleDate && (
            <View style={styles.stickyDateContainer} pointerEvents="none">
              <View style={styles.stickyDateBg}>
                <Text style={styles.stickyDateText}>{currentVisibleDate}</Text>
              </View>
            </View>
          )}
        </View>

        <ChatComposer
          selectedAttachments={selectedAttachments}
          inputText={inputText}
          isUploading={isUploading}
          bottomInset={insets.bottom}
          placeholder={t('chat.placeholder')}
          attachmentActionLabels={{
            chooseFromLibrary: t('chat.choose_from_library', 'Choose from library'),
            takePhoto: t('chat.take_photo', 'Take photo'),
            recordVideo: t('chat.record_video', 'Record video'),
            shareLocation: t('chat.share_location', 'Share location'),
          }}
          onPickAttachments={pickAttachments}
          onTakePhoto={takePhoto}
          onRecordVideo={recordVideo}
          onShareLocation={shareLocation}
          onRemoveAttachment={removeAttachment}
          onChangeText={setInputText}
          onSendMessage={() => sendMessage()}
        />
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
  stickyDateContainer: {
    position: 'absolute',
    top: 10,
    alignSelf: 'center',
    borderRadius: 20,
    overflow: 'hidden',
    zIndex: 10,
  },
  stickyDateBg: {
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
