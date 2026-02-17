import React, { memo } from 'react';
import { View, Image, TouchableOpacity, StyleSheet } from 'react-native';
import { VStack, Text, Center, Avatar, AvatarFallbackText, HStack } from '@gluestack-ui/themed';
import { Check, CheckCheck } from 'lucide-react-native';
import { format } from 'date-fns';
import { useVideoPlayer, VideoView } from 'expo-video';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { isVideoFile } from '../../utils/file';
import { ChatMessage } from '@repo/types';

export type ChatListItemData = ChatMessage | { type: 'date'; date: string; id: string };

type ChatListItemProps = {
  item: ChatListItemData;
  getDateLabel: (date: string) => string;
  onOpenImageViewer: (attachments: string[], index: number) => void;
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
      nativeControls={true}
      contentFit="contain"
    />
  );
};

function ChatListItemBase({ item, getDateLabel, onOpenImageViewer }: ChatListItemProps) {
  if ('type' in item && item.type === 'date') {
    return (
      <Center my="$4">
        <BlurView intensity={20} tint="light" style={styles.dateSeparator}>
          <Text style={styles.dateText}>{getDateLabel(item.date)}</Text>
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
}

export const ChatListItem = memo(ChatListItemBase);

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
});
