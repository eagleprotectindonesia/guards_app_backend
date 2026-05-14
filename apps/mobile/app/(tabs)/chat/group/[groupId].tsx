import React, { useCallback, useRef, useState } from 'react';
import { Alert, BackHandler, FlatList, Platform, StyleSheet, TouchableOpacity, View, ViewToken } from 'react-native';
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
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSocket } from '../../../../src/hooks/useSocket';
import { useAuth } from '../../../../src/contexts/AuthContext';
import { useCustomToast } from '../../../../src/hooks/useCustomToast';
import { reserveGroupChatDraft, uploadToS3 } from '../../../../src/api/upload';
import { isVideoFile } from '../../../../src/utils/file';
import { ChatListItem, ChatListItemData } from '../../../../src/components/chat/ChatListItem';
import { ChatHeader } from '../../../../src/components/chat/ChatHeader';
import { ChatComposer } from '../../../../src/components/chat/ChatComposer';
import { useGroupChatMessages } from '../../../../src/hooks/useGroupChatMessages';
import { client } from '../../../../src/api/client';
import { queryKeys } from '../../../../src/api/queryKeys';
import { useQueryClient } from '@tanstack/react-query';
import { useFocusEffect } from '@react-navigation/native';

const MAX_CHAT_VIDEO_SIZE_BYTES = 20 * 1024 * 1024;

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

  const flatListRef = useRef<FlatList>(null);
  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 10 }).current;

  const { messages, messagesWithDates, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage, getDateLabel, onViewableItemsChanged: getVisibleDateLabel } =
    useGroupChatMessages({ groupId, isAuthenticated: auth.isAuthenticated, socket, t });

  const addAttachments = useCallback((assets: ImagePicker.ImagePickerAsset[]) => {
    const validAssets = assets.filter(asset => ! (asset.type === 'video' && (asset.fileSize ?? 0) > MAX_CHAT_VIDEO_SIZE_BYTES));
    if (validAssets.length < assets.length) {
      toast.warning(t('chat.video_size_limit'), t('chat.video_size_limit_desc'));
    }
    if (validAssets.length > 0) setSelectedAttachments(prev => [...prev, ...validAssets].slice(0, 4));
  }, [t, toast]);

  const pickAttachments = async () => {
    if (selectedAttachments.length >= 4) return toast.warning(t('chat.limit_reached'), t('chat.limit_reached_desc'));
    try {
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images', 'videos'], allowsMultipleSelection: true, selectionLimit: 4 - selectedAttachments.length, quality: 0.7 });
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
    if (isUploading || !groupId) return;
    try {
      setIsUploading(true);
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return toast.error(t('chat.location_permission', 'Permission denied'), t('chat.location_permission_desc', 'Cannot access location.'));
      const location = await Location.getCurrentPositionAsync({});
      socket?.emit('group_send_message', { groupId, content: '', attachments: [], latitude: location.coords.latitude, longitude: location.coords.longitude });
    } finally { setIsUploading(false); }
  };

  const sendMessage = async () => {
    if ((!inputText.trim() && selectedAttachments.length === 0) || !socket || isUploading || !groupId) return;
    setIsUploading(true);
    try {
      let attachmentKeys: string[] = [];
      let messageId: string | undefined;
      if (selectedAttachments.length > 0) {
        const draft = await reserveGroupChatDraft(groupId);
        messageId = draft.messageId;
        attachmentKeys = await Promise.all(selectedAttachments.map(async asset => {
          const fileName = asset.fileName || `file_${Date.now()}.${asset.uri.split('.').pop()}`;
          const mimeType = asset.mimeType || (asset.type === 'video' ? 'video/mp4' : 'image/jpeg');
          const fileType = asset.type === 'video' ? 'video' : 'image';
          const response = await uploadToS3(asset.uri, fileName, mimeType, asset.fileSize || 0, { folder: 'group-chat', conversationId: groupId, messageId, fileType });
          return response.key;
        }));
      }
      socket.emit('group_send_message', { groupId, content: inputText.trim(), messageId, attachments: attachmentKeys });
      setInputText('');
      setSelectedAttachments([]);
    } catch {
      toast.error(t('chat.send_error'), t('chat.send_error_desc'));
    } finally { setIsUploading(false); }
  };

  const leaveGroup = useCallback(() => {
    if (!groupId) return;
    Alert.alert(t('chat.leave_group', 'Leave group'), t('chat.leave_group_confirm', 'Are you sure you want to leave this group?'), [
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
    ]);
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

  const renderItem = useCallback(({ item }: { item: ChatListItemData }) => <ChatListItem item={item} getDateLabel={getDateLabel} onOpenImageViewer={openImageViewer} />, [getDateLabel, openImageViewer]);

  if (isLoading && messages.length === 0) return <Center className="flex-1"><Spinner size="large" /></Center>;

  return (
    <View style={{ flex: 1, backgroundColor: '#121212' }}>
      <LinearGradient colors={['rgba(37, 99, 235, 0.05)', 'transparent']} style={[StyleSheet.absoluteFill, { height: '40%' }]} />
      <View>
        <ChatHeader
          topInset={insets.top}
          title={t('chat.group_chat', 'Group Chat')}
          statusText={t('chat.status_active').toUpperCase()}
          onBackPress={() => router.replace('/(tabs)/chat')}
        />
        <TouchableOpacity onPress={leaveGroup} style={styles.leaveButton}><Text style={styles.leaveText}>{t('chat.leave_group_action', 'Leave')}</Text></TouchableOpacity>
      </View>
      <KeyboardAvoidingView behavior="padding" keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0} style={{ flex: 1 }}>
        <View style={{ flex: 1 }}>
          <FlatList
            ref={flatListRef}
            data={messagesWithDates}
            inverted
            keyExtractor={item => item.id}
            renderItem={renderItem}
            contentContainerStyle={{ padding: 16, flexGrow: 1 }}
            onEndReached={() => { if (hasNextPage && !isFetchingNextPage) fetchNextPage(); }}
            onEndReachedThreshold={0.5}
            onViewableItemsChanged={({ viewableItems }: { viewableItems: ViewToken[] }) => {
              const label = getVisibleDateLabel({ viewableItems });
              if (label) setCurrentVisibleDate(prev => (prev === label ? prev : label));
            }}
            viewabilityConfig={viewabilityConfig}
          />
          {currentVisibleDate && <View style={styles.stickyDateContainer} pointerEvents="none"><View style={styles.stickyDateBg}><Text style={styles.stickyDateText}>{currentVisibleDate}</Text></View></View>}
        </View>
        <ChatComposer
          selectedAttachments={selectedAttachments}
          inputText={inputText}
          isUploading={isUploading}
          bottomInset={insets.bottom}
          placeholder={t('chat.placeholder')}
          attachmentActionLabels={{ chooseFromLibrary: t('chat.choose_from_library', 'Choose from library'), takePhoto: t('chat.take_photo', 'Take photo'), recordVideo: t('chat.record_video', 'Record video'), shareLocation: t('chat.share_location', 'Share location') }}
          onPickAttachments={pickAttachments}
          onTakePhoto={takePhoto}
          onRecordVideo={recordVideo}
          onShareLocation={shareLocation}
          onRemoveAttachment={index => setSelectedAttachments(prev => prev.filter((_, i) => i !== index))}
          onChangeText={setInputText}
          onSendMessage={sendMessage}
        />
      </KeyboardAvoidingView>
      <ImageView images={viewerImages} imageIndex={viewerIndex} visible={isViewerVisible} onRequestClose={() => setIsViewerVisible(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  leaveButton: { position: 'absolute', right: 16, top: 16, backgroundColor: 'rgba(239,68,68,0.2)', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  leaveText: { color: '#FCA5A5', fontWeight: '700', fontSize: 12 },
  stickyDateContainer: { position: 'absolute', top: 10, alignSelf: 'center', borderRadius: 20, overflow: 'hidden', zIndex: 10 },
  stickyDateBg: { paddingHorizontal: 16, paddingVertical: 6, backgroundColor: 'rgba(30, 30, 30, 0.6)' },
  stickyDateText: { fontSize: 11, fontWeight: '600', color: '#94A3B8', textTransform: 'uppercase' },
});
