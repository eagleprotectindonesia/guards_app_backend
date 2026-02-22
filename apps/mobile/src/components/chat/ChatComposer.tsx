import React from 'react';
import { View, Image, TouchableOpacity, TextInput, ScrollView, StyleSheet } from 'react-native';
import { HStack, Spinner, Box } from '@gluestack-ui/themed';
import { Paperclip, X, Video as VideoIcon, Camera, Send, MapPin } from 'lucide-react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import * as ImagePicker from 'expo-image-picker';

type ChatComposerProps = {
  selectedAttachments: ImagePicker.ImagePickerAsset[];
  inputText: string;
  isUploading: boolean;
  bottomInset: number;
  placeholder: string;
  onPickAttachments: () => void;
  onTakePhoto: () => void;
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
  onPickAttachments,
  onTakePhoto,
  onShareLocation,
  onRemoveAttachment,
  onChangeText,
  onSendMessage,
}: ChatComposerProps) {
  const sendDisabled = (!inputText.trim() && selectedAttachments.length === 0) || isUploading;

  return (
    <>
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
          <HStack space="xs" alignItems="center">
            <TouchableOpacity onPress={onPickAttachments} disabled={isUploading} style={styles.attachButton}>
              <Paperclip size={22} color="#94A3B8" />
            </TouchableOpacity>
            <TouchableOpacity onPress={onTakePhoto} disabled={isUploading} style={styles.attachButton}>
              <Camera size={22} color="#94A3B8" />
            </TouchableOpacity>
            <TouchableOpacity onPress={onShareLocation} disabled={isUploading} style={styles.attachButton}>
              <MapPin size={22} color="#94A3B8" />
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
                {isUploading ? <Spinner color="white" size="small" /> : <Send size={18} color="white" />}
              </LinearGradient>
            </TouchableOpacity>
          </HStack>
        </BlurView>
        <View style={{ height: bottomInset + 8 }} />
      </View>
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
