import React, { memo } from 'react';
import { View, Image, TouchableOpacity, StyleSheet } from 'react-native';
import { VStack } from '@/components/ui/vstack';
import { Text } from '@/components/ui/text';
import { Center } from '@/components/ui/center';
import { Avatar, AvatarFallbackText } from '@/components/ui/avatar';
import { HStack } from '@/components/ui/hstack';
import { Spinner } from '@/components/ui/spinner';
import { Check, CheckCheck, MapPin, RefreshCw, FileText } from 'lucide-react-native';
import { format } from 'date-fns';
import * as Linking from 'expo-linking';
import { useVideoPlayer, VideoView } from 'expo-video';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { isVideoFile, isPdfFile } from '../../utils/file';
import { ChatMessage, GroupChatMessage } from '@repo/types';

export type PendingMessageItemData = {
  type: 'pending' | 'failed';
  id: string;
  content: string;
  attachmentUris: string[];
  createdAt: string;
};

export type ChatListItemData =
  | ChatMessage
  | GroupChatMessage
  | { type: 'date'; date: string; id: string }
  | PendingMessageItemData;

type ChatListItemProps = {
  item: ChatListItemData;
  getDateLabel: (date: string) => string;
  onOpenImageViewer: (attachments: string[], index: number) => void;
  onRetryMessage?: (id: string) => void;
};

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
      nativeControls
      contentFit="contain"
    />
  );
};

function PendingMessageItem({ item, onRetry }: { item: PendingMessageItemData; onRetry?: (id: string) => void }) {
  const isFailed = item.type === 'failed';

  const handleRetry = () => {
    if (isFailed && onRetry) {
      onRetry(item.id);
    }
  };

  return (
    <View style={[styles.messageContainer, styles.myMessage]}>
      <VStack style={styles.myVStack}>
        <TouchableOpacity onPress={isFailed ? handleRetry : undefined} activeOpacity={isFailed ? 0.6 : 1}>
          <BlurView
            intensity={40}
            tint="dark"
            style={[styles.messageBubble, styles.myBubble, isFailed && styles.failedBubble]}
          >
            <LinearGradient
              colors={['rgba(239, 68, 68, 0.15)', 'transparent']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={StyleSheet.absoluteFill}
            />
            {item.attachmentUris.length > 0 && (
              <View style={styles.attachmentsContainer}>
                {item.attachmentUris.map((uri, i) => (
                  <View key={i} style={[styles.attachmentWrapper, isFailed && styles.failedAttachment]}>
                    <Image
                      source={{ uri }}
                      style={[styles.attachmentImage, item.attachmentUris.length > 1 && styles.multiAttachmentImage]}
                      resizeMode="cover"
                    />
                  </View>
                ))}
              </View>
            )}
            {item.content ? <Text style={[styles.messageText, styles.myText]}>{item.content}</Text> : null}
            <HStack space="xs" className="justify-end items-center mt-1">
              <Text style={[styles.messageTime, styles.myTime]}>{format(new Date(item.createdAt), 'HH:mm')}</Text>
              {isFailed ? <RefreshCw size={12} color="#EF4444" /> : <Spinner size={10} color="#EF4444" />}
            </HStack>
          </BlurView>
        </TouchableOpacity>
        {isFailed && (
          <TouchableOpacity onPress={handleRetry} style={styles.retryButton}>
            <HStack space="xs" className="items-center">
              <RefreshCw size={12} color="#EF4444" />
              <Text style={styles.retryText}>Tap to retry</Text>
            </HStack>
          </TouchableOpacity>
        )}
      </VStack>
    </View>
  );
}

function ChatListItemBase({ item, getDateLabel, onOpenImageViewer, onRetryMessage }: ChatListItemProps) {
  if ('type' in item) {
    if (item.type === 'date') {
      return (
        <Center className="my-4">
          <BlurView intensity={20} tint="light" style={styles.dateSeparator}>
            <Text style={styles.dateText}>{getDateLabel(item.date)}</Text>
          </BlurView>
        </Center>
      );
    }
    if (item.type === 'pending' || item.type === 'failed') {
      return <PendingMessageItem item={item as PendingMessageItemData} onRetry={onRetryMessage} />;
    }
  }

  const message = item as ChatMessage | GroupChatMessage;
  const isGroupMessage = 'groupId' in message;
  const isMe = isGroupMessage ? message.senderType === 'employee' : message.sender === 'employee';
  const senderName = isGroupMessage ? message.senderName : message.admin?.name || 'Admin';

  return (
    <View style={[styles.messageContainer, isMe ? styles.myMessage : styles.theirMessage]}>
      {!isMe && (
        <Avatar size="xs" className="bg-info-600 mr-2 mt-1">
          <AvatarFallbackText className="text-white">{senderName || 'A'}</AvatarFallbackText>
        </Avatar>
      )}
      <VStack style={isMe ? styles.myVStack : styles.theirVStack}>
        {!isMe && <Text style={styles.senderName}>{senderName}</Text>}
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
                if (isPdfFile(url)) {
                  return (
                    <TouchableOpacity
                      key={i}
                      onPress={() => Linking.openURL(url)}
                      style={[styles.attachmentWrapper, { height: 56 }]}
                    >
                      <View
                        style={{
                          flex: 1,
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: 8,
                          paddingHorizontal: 12,
                          backgroundColor: 'rgba(255,255,255,0.08)',
                          borderRadius: 12,
                        }}
                      >
                        <FileText size={20} color={isMe ? '#FFF' : '#EF4444'} />
                        <Text style={isMe ? styles.myText : styles.theirText} numberOfLines={1} ellipsizeMode="middle">
                          PDF file
                        </Text>
                      </View>
                    </TouchableOpacity>
                  );
                }
                const isVideo = isVideoFile(url);
                return (
                  <View key={i} style={styles.attachmentWrapper}>
                    {isVideo ? (
                      <VideoAttachment
                        url={url}
                        style={[styles.attachmentImage, message.attachments.length > 1 && styles.multiAttachmentImage]}
                      />
                    ) : (
                      <TouchableOpacity onPress={() => onOpenImageViewer(message.attachments, i)}>
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
          {message.latitude && message.longitude && (!message.attachments || message.attachments.length === 0) && (
            <TouchableOpacity
              onPress={() => Linking.openURL(`https://maps.google.com/?q=${message.latitude},${message.longitude}`)}
              style={[styles.locationWrapper, isMe ? styles.myLocationWrapper : styles.theirLocationWrapper]}
            >
              <MapPin size={24} color={isMe ? '#FFF' : '#EF4444'} />
              <VStack className="ml-2">
                <Text style={isMe ? styles.myLocationText : styles.theirLocationText}>Shared Location</Text>
                <Text style={styles.locationSubText}>Tap to open in Maps</Text>
              </VStack>
            </TouchableOpacity>
          )}
          {message.content ? (
            <Text style={[styles.messageText, isMe ? styles.myText : styles.theirText]}>{message.content}</Text>
          ) : null}
          <HStack space="xs" className="justify-end items-center mt-1">
            <Text style={[styles.messageTime, isMe ? styles.myTime : styles.theirTime]}>
              {format(new Date(message.createdAt), 'HH:mm')}
            </Text>
            {!isGroupMessage && isMe && (
              <View style={styles.readStatusContainer}>
                {message.readAt ? <CheckCheck size={12} color="#EF4444" /> : <Check size={12} color="#6B7280" />}
              </View>
            )}
          </HStack>
        </BlurView>
      </VStack>
    </View>
  );
}

export const ChatListItem = memo(ChatListItemBase);

const styles = StyleSheet.create({
  messageContainer: { flexDirection: 'row', marginBottom: 20, maxWidth: '85%' },
  myMessage: { alignSelf: 'flex-end', flexDirection: 'row-reverse' },
  theirMessage: { alignSelf: 'flex-start' },
  myVStack: { alignItems: 'flex-end' },
  theirVStack: { alignItems: 'flex-start' },
  messageBubble: { padding: 12, borderRadius: 20, overflow: 'hidden' },
  myBubble: {
    backgroundColor: 'rgba(60, 20, 20, 0.4)',
    borderBottomRightRadius: 4,
    shadowColor: '#EF4444',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 0,
  },
  theirBubble: { backgroundColor: 'rgba(40, 40, 40, 0.6)', borderBottomLeftRadius: 4 },
  failedBubble: { opacity: 0.7 },
  failedAttachment: { opacity: 0.7 },
  messageText: { fontSize: 15, lineHeight: 20 },
  myText: { color: 'white' },
  theirText: { color: '#E2E8F0' },
  senderName: {
    fontSize: 10,
    color: '#94A3B8',
    marginBottom: 4,
    marginLeft: 4,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  messageTime: { fontSize: 10 },
  myTime: { color: 'rgba(255, 255, 255, 0.5)' },
  theirTime: { color: '#64748B' },
  readStatusContainer: { marginLeft: 2 },
  attachmentsContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 10, width: 220 },
  attachmentWrapper: { borderRadius: 12, overflow: 'hidden' },
  attachmentImage: { width: 220, height: 160 },
  multiAttachmentImage: { width: 107, height: 107 },
  locationWrapper: { flexDirection: 'row', alignItems: 'center', padding: 12, borderRadius: 12, marginBottom: 6 },
  myLocationWrapper: { backgroundColor: 'rgba(255, 255, 255, 0.1)' },
  theirLocationWrapper: { backgroundColor: 'rgba(0, 0, 0, 0.2)' },
  myLocationText: { color: 'white', fontWeight: '600', fontSize: 14 },
  theirLocationText: { color: '#E2E8F0', fontWeight: '600', fontSize: 14 },
  locationSubText: { color: '#94A3B8', fontSize: 12 },
  dateSeparator: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
    overflow: 'hidden',
  },
  dateText: { fontSize: 11, fontWeight: '600', color: '#94A3B8', textTransform: 'uppercase' },
  retryButton: { marginTop: 4, paddingVertical: 4, paddingHorizontal: 8 },
  retryText: { fontSize: 11, color: '#EF4444', fontWeight: '600' },
});
