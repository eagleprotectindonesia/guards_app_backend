import React, { useState } from 'react';
import { View, Image, TouchableOpacity, TextInput, ScrollView, StyleSheet } from 'react-native';
import { HStack } from '@/components/ui/hstack';
import { Spinner } from '@/components/ui/spinner';
import { Box } from '@/components/ui/box';
import { Paperclip, X, Video as VideoIcon, Camera, Send, MapPin } from 'lucide-react-native';
import {
  Actionsheet,
  ActionsheetBackdrop,
  ActionsheetContent,
  ActionsheetDragIndicator,
  ActionsheetDragIndicatorWrapper,
  ActionsheetItem,
  ActionsheetItemText,
} from '@/components/ui/actionsheet';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import * as ImagePicker from 'expo-image-picker';

type AttachmentActionLabels = {
  chooseFromLibrary: string;
  takePhoto: string;
  recordVideo: string;
  shareLocation: string;
};

type ChatComposerProps = {
  selectedAttachments: ImagePicker.ImagePickerAsset[];
  inputText: string;
  isUploading: boolean;
  bottomInset: number;
  placeholder: string;
  attachmentActionLabels: AttachmentActionLabels;
  onPickAttachments: () => void;
  onTakePhoto: () => void;
  onRecordVideo: () => void;
  onShareLocation: () => void;
  onRemoveAttachment: (index: number) => void;
  onChangeText: (value: string) => void;
  onSendMessage: () => void;
};

export function ChatComposer({
  selectedAttachments,
  inputText,
  isUploading,
  bottomInset,
  placeholder,
  attachmentActionLabels,
  onPickAttachments,
  onTakePhoto,
  onRecordVideo,
  onShareLocation,
  onRemoveAttachment,
  onChangeText,
  onSendMessage,
}: ChatComposerProps) {
  const [showAttachmentActions, setShowAttachmentActions] = useState(false);
  const sendDisabled = (!inputText.trim() && selectedAttachments.length === 0) || isUploading;

  const runAttachmentAction = (action: () => void) => {
    setShowAttachmentActions(false);
    action();
  };

  return (
    <>
      {selectedAttachments.length > 0 && (
        <View style={styles.previewsContainer}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {selectedAttachments.map((asset, index) => (
              <View key={index} style={styles.previewItem}>
                {asset.type === 'video' ? (
                  <Box style={styles.previewMedia} className="bg-background-800 justify-center items-center">
                    <VideoIcon size={24} color="#6B7280" />
                  </Box>
                ) : (
                  <Image source={{ uri: asset.uri }} style={styles.previewMedia} />
                )}
                <TouchableOpacity style={styles.removePreviewButton} onPress={() => onRemoveAttachment(index)}>
                  <X size={12} color="white" />
                </TouchableOpacity>
              </View>
            ))}
          </ScrollView>
        </View>
      )}

      <View style={styles.inputContainerWrapper}>
        <BlurView intensity={60} tint="dark" style={styles.inputBlurContainer}>
          <HStack className="items-center">
            <TouchableOpacity
              onPress={() => setShowAttachmentActions(true)}
              disabled={isUploading}
              style={styles.attachButton}
            >
              <Paperclip size={18} color="#94A3B8" />
            </TouchableOpacity>
            <TextInput
              style={styles.input}
              placeholder={placeholder}
              placeholderTextColor="#64748B"
              value={inputText}
              onChangeText={onChangeText}
              multiline
              editable={!isUploading}
            />

            <TouchableOpacity onPress={onSendMessage} disabled={sendDisabled}>
              <LinearGradient
                colors={['#EF4444', '#991B1B']}
                style={[styles.sendButton, sendDisabled && styles.sendButtonDisabled]}
              >
                {isUploading ? <Spinner className="text-white" size="small" /> : <Send size={18} color="white" />}
              </LinearGradient>
            </TouchableOpacity>
          </HStack>
        </BlurView>
        <View style={{ height: bottomInset + 8 }} />
      </View>

      <Actionsheet isOpen={showAttachmentActions} onClose={() => setShowAttachmentActions(false)}>
        <ActionsheetBackdrop />
        <ActionsheetContent className="bg-[#1C1C1E] border-t border-white/10">
          <ActionsheetDragIndicatorWrapper>
            <ActionsheetDragIndicator className="bg-white/20" />
          </ActionsheetDragIndicatorWrapper>
          <View style={styles.actionSheetBody}>
            <ActionsheetItem
              onPress={() => runAttachmentAction(onTakePhoto)}
              className="rounded-xl mb-2 py-3 px-4 bg-white/5 active:bg-white/10"
            >
              <Camera size={18} color="#94A3B8" />
              <ActionsheetItemText className="text-white font-bold text-md">
                {attachmentActionLabels.takePhoto}
              </ActionsheetItemText>
            </ActionsheetItem>
            <ActionsheetItem
              onPress={() => runAttachmentAction(onRecordVideo)}
              className="rounded-xl mb-2 py-3 px-4 bg-white/5 active:bg-white/10"
            >
              <VideoIcon size={18} color="#94A3B8" />
              <ActionsheetItemText className="text-white font-bold text-md">
                {attachmentActionLabels.recordVideo}
              </ActionsheetItemText>
            </ActionsheetItem>
            <ActionsheetItem
              onPress={() => runAttachmentAction(onPickAttachments)}
              className="rounded-xl mb-2 py-3 px-4 bg-white/5 active:bg-white/10"
            >
              <Paperclip size={18} color="#94A3B8" />
              <ActionsheetItemText className="text-white font-bold text-md">
                {attachmentActionLabels.chooseFromLibrary}
              </ActionsheetItemText>
            </ActionsheetItem>
            <ActionsheetItem
              onPress={() => runAttachmentAction(onShareLocation)}
              className="rounded-xl py-3 px-4 bg-white/5 active:bg-white/10"
            >
              <MapPin size={18} color="#94A3B8" />
              <ActionsheetItemText className="text-white font-bold text-md">
                {attachmentActionLabels.shareLocation}
              </ActionsheetItemText>
            </ActionsheetItem>
          </View>
        </ActionsheetContent>
      </Actionsheet>
    </>
  );
}

const styles = StyleSheet.create({
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
  actionSheetBody: {
    width: '100%',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 32,
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
});
