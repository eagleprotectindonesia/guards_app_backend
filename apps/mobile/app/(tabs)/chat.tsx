import React, { useCallback, useRef, useState } from 'react';
import { FlatList, Platform, StyleSheet, View, ViewToken } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import ImageView from 'react-native-image-viewing';
import { Text, Spinner, Center } from '@gluestack-ui/themed';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import * as ImagePicker from 'expo-image-picker';
import { useSocket } from '../../src/hooks/useSocket';
import { useAuth } from '../../src/contexts/AuthContext';
import { useCustomToast } from '../../src/hooks/useCustomToast';
import { uploadToS3 } from '../../src/api/upload';
import { isVideoFile } from '../../src/utils/file';
import { ChatListItem, ChatListItemData } from '../../src/components/chat/ChatListItem';
import { ChatHeader } from '../../src/components/chat/ChatHeader';
import { ChatComposer } from '../../src/components/chat/ChatComposer';
import { useChatMessages } from '../../src/hooks/useChatMessages';

export default function ChatScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { socket } = useSocket();
  const auth = useAuth();
  const toast = useCustomToast();

  const [inputText, setInputText] = useState('');
  const [selectedAttachments, setSelectedAttachments] = useState<ImagePicker.ImagePickerAsset[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isViewerVisible, setIsViewerVisible] = useState(false);
  const [viewerImages, setViewerImages] = useState<{ uri: string }[]>([]);
  const [viewerIndex, setViewerIndex] = useState(0);
  const [currentVisibleDate, setCurrentVisibleDate] = useState<string | null>(null);

  const flatListRef = useRef<FlatList>(null);
  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 10 }).current;

  const employeeId = auth.user?.id;

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
        setSelectedAttachments(prev => [...prev, ...result.assets].slice(0, 4));
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
        mediaTypes: ['images', 'videos'],
        quality: 0.7,
      });

      if (!result.canceled) {
        setSelectedAttachments(prev => [...prev, ...result.assets].slice(0, 4));
      }
    } catch (error) {
      console.error('Error taking photo:', error);
      toast.error(t('chat.camera_error'), t('chat.camera_error_desc'));
    }
  };

  const removeAttachment = useCallback((index: number) => {
    setSelectedAttachments(prev => prev.filter((_, i) => i !== index));
  }, []);

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
      toast.error(t('chat.send_error'), t('chat.send_error_desc'));
    } finally {
      setIsUploading(false);
    }
  };

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
      <ChatListItem item={item} getDateLabel={getDateLabel} onOpenImageViewer={openImageViewer} />
    ),
    [getDateLabel, openImageViewer]
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

      <ChatHeader topInset={insets.top} title={t('chat.title')} statusText={t('chat.status_active').toUpperCase()} />

      <KeyboardAvoidingView behavior="padding" keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0} style={{ flex: 1 }}>
        <View style={{ flex: 1 }}>
          <FlatList
            ref={flatListRef}
            data={messagesWithDates}
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
          onPickAttachments={pickAttachments}
          onTakePhoto={takePhoto}
          onRemoveAttachment={removeAttachment}
          onChangeText={setInputText}
          onSendMessage={sendMessage}
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
