import React, { useCallback, useMemo, useRef, useState } from 'react';
import { Alert, BackHandler, FlatList, Platform, StyleSheet, View, ViewToken } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { Text } from '@/components/ui/text';
import { Spinner } from '@/components/ui/spinner';
import { Center } from '@/components/ui/center';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSocket } from '../../../../src/hooks/useSocket';
import { useAuth } from '../../../../src/contexts/AuthContext';
import { useCustomToast } from '../../../../src/hooks/useCustomToast';
import { reserveGroupChatDraft, uploadToS3 } from '../../../../src/api/upload';
import { isVideoFile } from '../../../../src/utils/file';
import { optimizeImage } from '../../../../src/utils/imageOptimization';
import { ChatListItem, ChatListItemData } from '../../../../src/components/chat/ChatListItem';
import { ChatHeader } from '../../../../src/components/chat/ChatHeader';
import { ChatComposer } from '../../../../src/components/chat/ChatComposer';
import { useGroupChatMessages } from '../../../../src/hooks/useGroupChatMessages';
import { client } from '../../../../src/api/client';
import { fetchGroupChat } from '../../../../src/api/group-chat';
import { queryKeys } from '../../../../src/api/queryKeys';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useFocusEffect } from '@react-navigation/native';
import { GroupSendMessageAck } from '@repo/types';

import ImageView from 'react-native-image-viewing';

const MAX_CHAT_VIDEO_SIZE_BYTES = 20 * 1024 * 1024;
const SEND_TIMEOUT = 20000;

type PendingEntry = {
  clientId: string;
  status: 'sending' | 'failed';
  content: string;
  attachments: ImagePicker.ImagePickerAsset[];
  createdAt: string;
};

export default function GroupChatScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { socket } = useSocket();
  const auth = useAuth();
  const toast = useCustomToast();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { groupId } = useLocalSearchParams<{ groupId: string }>();

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

  const {
    messages,
    messagesWithDates,
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    getDateLabel,
    onViewableItemsChanged: getVisibleDateLabel,
  } = useGroupChatMessages({ groupId, isAuthenticated: auth.isAuthenticated, socket, t });

  const { data: group } = useQuery({
    queryKey: queryKeys.chat.groupMetadata(groupId),
    queryFn: () => fetchGroupChat(groupId),
    enabled: !!groupId,
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
      const validAssets = assets.filter(
        asset => !(asset.type === 'video' && (asset.fileSize ?? 0) > MAX_CHAT_VIDEO_SIZE_BYTES)
      );
      if (validAssets.length < assets.length) {
        toast.warning(t('chat.video_size_limit'), t('chat.video_size_limit_desc'));
      }
      if (validAssets.length > 0) setSelectedAttachments(prev => [...prev, ...validAssets].slice(0, 4));
    },
    [t, toast]
  );

  const pickAttachments = async () => {
    if (selectedAttachments.length >= 4) return toast.warning(t('chat.limit_reached'), t('chat.limit_reached_desc'));
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images', 'videos'],
        allowsMultipleSelection: true,
        selectionLimit: 4 - selectedAttachments.length,
        quality: 0.7,
      });
      if (!result.canceled) addAttachments(result.assets);
    } catch {
      toast.error(t('chat.pick_error'), t('chat.pick_error_desc'));
    }
  };

  const takePhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') return toast.error(t('chat.camera_permission'), t('chat.camera_permission_desc'));
    const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.7 });
    if (!result.canceled) addAttachments(result.assets);
  };

  const recordVideo = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') return toast.error(t('chat.camera_permission'), t('chat.camera_permission_desc'));
    const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['videos'], quality: 0.7 });
    if (!result.canceled) addAttachments(result.assets);
  };

  const shareLocation = async () => {
    if (isUploading || !groupId || !socket) return;
    try {
      setIsUploading(true);
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted')
        return toast.error(
          t('chat.location_permission', 'Permission denied'),
          t('chat.location_permission_desc', 'Cannot access location.')
        );
      const location = await Location.getCurrentPositionAsync({});
      const ack = await socket.timeout(SEND_TIMEOUT).emitWithAck('group_send_message', {
        groupId,
        content: '',
        attachments: [],
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
      }) as GroupSendMessageAck;

      if (!ack.success) {
        toast.error(t('chat.send_error', 'Send failed'), ack.error);
      }
    } catch {
      toast.error(t('chat.location_error', 'Location error'), t('chat.location_error_desc', 'Unable to fetch your location.'));
    } finally {
      setIsUploading(false);
    }
  };

  const sendMessage = useCallback(async (retryEntry?: PendingEntry) => {
    const content = retryEntry?.content ?? inputText.trim();
    const attachments = retryEntry?.attachments ?? selectedAttachments;
    const hasContent = content.length > 0 || attachments.length > 0;

    if (!hasContent || !socket || !groupId) return;
    if (!retryEntry && isUploading) return;

    const clientId = retryEntry?.clientId ?? `${Date.now()}-${clientIdCounter.current++}`;

    if (!retryEntry) {
      setPendingEntries(prev => [...prev, {
        clientId,
        status: 'sending',
        content,
        attachments,
        createdAt: new Date().toISOString(),
      }]);
    } else {
      setPendingEntries(prev => prev.map(e => e.clientId === clientId ? { ...e, status: 'sending' } : e));
    }

    setIsUploading(true);
    try {
      let attachmentKeys: string[] = [];
      let messageId: string | undefined;

      if (attachments.length > 0) {
        const draft = await reserveGroupChatDraft(groupId);
        messageId = draft.messageId;

        attachmentKeys = await Promise.all(
          attachments.map(async asset => {
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
              folder: 'group-chat',
              conversationId: groupId,
              messageId,
              fileType,
            });
            return response.key;
          })
        );
      }

      const ack = await socket.timeout(SEND_TIMEOUT).emitWithAck('group_send_message', {
        groupId,
        content,
        messageId,
        attachments: attachmentKeys,
      }) as GroupSendMessageAck;

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
    } catch {
      setPendingEntries(prev => prev.map(e => e.clientId === clientId ? { ...e, status: 'failed' } : e));
      toast.error(t('chat.send_error'), t('chat.send_error_desc'));
    } finally {
      setIsUploading(false);
    }
  }, [socket, selectedAttachments, inputText, isUploading, groupId, t, toast]);

  const retryMessage = useCallback((clientId: string) => {
    const entry = pendingEntries.find(e => e.clientId === clientId);
    if (entry && entry.status === 'failed') {
      sendMessage(entry);
    }
  }, [pendingEntries, sendMessage]);

  const leaveGroup = useCallback(() => {
    if (!groupId) return;
    Alert.alert(
      t('chat.leave_group', 'Leave group'),
      t('chat.leave_group_confirm', 'Are you sure you want to leave this group?'),
      [
        { text: t('common.cancel', 'Cancel'), style: 'cancel' },
        {
          text: t('chat.leave_group_action', 'Leave'),
          style: 'destructive',
          onPress: async () => {
            await client.post(`/api/shared/group-chat/${groupId}/leave`);
            await queryClient.invalidateQueries({ queryKey: queryKeys.chat.groupList });
            await queryClient.invalidateQueries({ queryKey: queryKeys.chat.inbox });
            router.replace('/(tabs)/chat');
          },
        },
      ]
    );
  }, [groupId, queryClient, router, t]);

  const openImageViewer = useCallback((attachments: string[], index: number) => {
    if (attachments[index] && isVideoFile(attachments[index])) return;
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

  if (isLoading && messages.length === 0)
    return (
      <Center className="flex-1">
        <Spinner size="large" />
      </Center>
    );

  return (
    <View style={{ flex: 1, backgroundColor: '#121212' }}>
      <LinearGradient
        colors={['rgba(255, 255, 255, 0.05)', 'transparent']}
        style={[StyleSheet.absoluteFill, { height: '40%' }]}
      />
      <ChatHeader
        topInset={insets.top}
        title={group?.title ?? t('chat.group_chat', 'Group Chat')}
        statusText={t('chat.status_active').toUpperCase()}
        onBackPress={() => router.replace('/(tabs)/chat')}
        onMorePress={leaveGroup}
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
            keyExtractor={item => item.id}
            renderItem={renderItem}
            contentContainerStyle={{ padding: 16, flexGrow: 1 }}
            onEndReached={() => {
              if (hasNextPage && !isFetchingNextPage) fetchNextPage();
            }}
            onEndReachedThreshold={0.5}
            ListFooterComponent={isFetchingNextPage ? () => <View style={{ padding: 10 }}><Spinner size="small" /></View> : undefined}
            onViewableItemsChanged={({ viewableItems }: { viewableItems: ViewToken[] }) => {
              const label = getVisibleDateLabel({ viewableItems });
              if (label) setCurrentVisibleDate(prev => (prev === label ? prev : label));
            }}
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
          onRemoveAttachment={index => setSelectedAttachments(prev => prev.filter((_, i) => i !== index))}
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
  stickyDateBg: { paddingHorizontal: 16, paddingVertical: 6, backgroundColor: 'rgba(30, 30, 30, 0.6)' },
  stickyDateText: { fontSize: 11, fontWeight: '600', color: '#94A3B8', textTransform: 'uppercase' },
});
