import React, { useState, useCallback, useRef } from 'react';
import { Image, Modal, Pressable, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { File } from 'expo-file-system';
import { Camera } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Text } from '@/components/ui/text';
import { useCustomToast } from './useCustomToast';
import { uploadToS3 } from '../api/upload';
import {
  ATTENDANCE_PHOTO_QUALITY,
  ATTENDANCE_PHOTO_CONTENT_TYPE,
  buildResizeAction,
} from '../utils/attendance-image';

export type AttendancePhotoUpload = {
  key: string;
  metadata: {
    pictureOriginal?: {
      width?: number;
      height?: number;
      fileSize?: number;
      contentType?: string;
    };
    pictureOptimized: {
      width?: number;
      height?: number;
      fileSize: number;
      contentType: string;
    };
  };
};

type UseAttendancePhotoUploadOptions = {
  folder: 'attendance' | 'office-attendance';
};

type InAppCaptureResult =
  | { kind: 'asset'; asset: ImagePicker.ImagePickerAsset }
  | { kind: 'cancelled' }
  | { kind: 'failed' };

export function useAttendancePhotoUpload({ folder }: UseAttendancePhotoUploadOptions) {
  const { t } = useTranslation();
  const toast = useCustomToast();
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const isProcessingRef = useRef(false);

  const [cameraOpen, setCameraOpen] = useState(false);
  const [capturedUri, setCapturedUri] = useState<string | null>(null);
  const [capturedUriWidth, setCapturedUriWidth] = useState<number>(0);
  const [capturedUriHeight, setCapturedUriHeight] = useState<number>(0);
  const [isCapturing, setIsCapturing] = useState(false);
  const [cameraResolve, setCameraResolve] = useState<((result: InAppCaptureResult) => void) | null>(null);
  const [cameraRef, setCameraRef] = useState<CameraView | null>(null);

  const [isProcessing, setIsProcessing] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');

  const captureWithSystemCamera = useCallback(async (): Promise<ImagePicker.ImagePickerAsset | null> => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();

    if (permission.status !== 'granted') {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      toast.error(
        t('attendance.permissionDeniedTitle'),
        t('officeAttendance.errors.cameraRequired', 'Camera permission is required.')
      );
      return null;
    }

    setStatusMessage(t('officeAttendance.takingPhoto', 'Taking attendance photo'));

    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: false,
      mediaTypes: ['images'],
      cameraType: ImagePicker.CameraType.front,
      quality: 1,
    });

    if (result.canceled || !result.assets[0]?.uri) {
      setStatusMessage(t('officeAttendance.errors.photoRequired', 'Attendance photo is required.'));
      return null;
    }

    return result.assets[0];
  }, [t, toast]);

  const captureWithInAppCamera = useCallback(async (): Promise<InAppCaptureResult> => {
    if (!cameraPermission?.granted) {
      const permission = await requestCameraPermission();
      if (!permission.granted) {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        toast.error(
          t('attendance.permissionDeniedTitle'),
          t('officeAttendance.errors.cameraRequired', 'Camera permission is required to record attendance.')
        );
        return { kind: 'cancelled' };
      }
    }

    setCapturedUri(null);
    setCapturedUriWidth(0);
    setCapturedUriHeight(0);
    setCameraOpen(true);

    return await new Promise(resolve => {
      setCameraResolve(() => resolve);
    });
  }, [cameraPermission, requestCameraPermission, t, toast]);

  const closeCameraWithResult = useCallback((result: InAppCaptureResult) => {
    const resolver = cameraResolve;
    setCameraResolve(null);
    setCameraOpen(false);
    setCapturedUri(null);
    if (resolver) resolver(result);
  }, [cameraResolve]);

  const handleTakePhotoInApp = useCallback(async () => {
    if (!cameraRef || isCapturing) return;
    setIsCapturing(true);
    try {
      const photo = await cameraRef.takePictureAsync({ quality: 1 });
      if (photo?.uri) {
        setCapturedUri(photo.uri);
        setCapturedUriWidth(photo.width ?? 0);
        setCapturedUriHeight(photo.height ?? 0);
      }
    } catch (error) {
      console.error('In-app camera capture failed:', error);
      closeCameraWithResult({ kind: 'failed' });
    } finally {
      setIsCapturing(false);
    }
  }, [cameraRef, isCapturing, closeCameraWithResult]);

  const handleUsePhoto = useCallback(() => {
    if (!capturedUri) {
      closeCameraWithResult({ kind: 'cancelled' });
      return;
    }

    closeCameraWithResult({
      kind: 'asset',
      asset: {
        uri: capturedUri,
        width: capturedUriWidth,
        height: capturedUriHeight,
        fileSize: undefined,
        mimeType: 'image/jpeg',
        assetId: null,
        base64: null,
        exif: null,
        fileName: undefined,
        type: 'image',
        duration: null,
        pairedVideoAsset: null,
      },
    });
  }, [capturedUri, capturedUriWidth, capturedUriHeight, closeCameraWithResult]);

  const captureAndUpload = useCallback(async (): Promise<AttendancePhotoUpload | null> => {
    if (isProcessingRef.current) return null;
    isProcessingRef.current = true;
    setIsProcessing(true);
    setStatusMessage(t('officeAttendance.takingPhoto', 'Taking attendance photo'));

    try {
      const inApp = await captureWithInAppCamera();
      let asset: ImagePicker.ImagePickerAsset | null = null;
      if (inApp.kind === 'asset') asset = inApp.asset;
      if (inApp.kind === 'failed') asset = await captureWithSystemCamera();
      if (!asset?.uri) return null;

      const resizeAction = buildResizeAction(asset.width, asset.height);
      const ImageManipulator = await import('expo-image-manipulator');

      setStatusMessage(t('officeAttendance.optimizingPhoto', 'Optimizing attendance photo'));

      const optimized = await ImageManipulator.manipulateAsync(asset.uri, resizeAction ? [resizeAction] : [], {
        compress: ATTENDANCE_PHOTO_QUALITY,
        format: ImageManipulator.SaveFormat.WEBP,
      });
      const optimizedFile = new File(optimized.uri);

      if (!optimizedFile.exists || optimizedFile.size == null || optimizedFile.size <= 0) {
        throw new Error('Optimized attendance photo is empty');
      }

      setStatusMessage(t('officeAttendance.uploadingPhoto', 'Uploading attendance photo'));

      const filename = `${folder}-${Date.now()}.webp`;
      const upload = await uploadToS3(
        optimized.uri,
        filename,
        ATTENDANCE_PHOTO_CONTENT_TYPE,
        optimizedFile.size,
        {
          folder,
          fileType: 'image',
        }
      );

      return {
        key: upload.key,
        metadata: {
          pictureOriginal: {
            width: asset.width,
            height: asset.height,
            fileSize: asset.fileSize,
            contentType: asset.mimeType,
          },
          pictureOptimized: {
            width: optimized.width,
            height: optimized.height,
            fileSize: upload.size,
            contentType: upload.contentType,
          },
        },
      };
    } finally {
      isProcessingRef.current = false;
      setIsProcessing(false);
    }
  }, [t, captureWithInAppCamera, captureWithSystemCamera, folder]);

  const cameraModal = (
    <Modal visible={cameraOpen} animationType="slide" transparent={false} onRequestClose={() => closeCameraWithResult({ kind: 'cancelled' })}>
      <View style={{ flex: 1, backgroundColor: '#000' }}>
        {!capturedUri ? (
          <>
            <CameraView
              style={{ flex: 1 }}
              facing="front"
              onMountError={() => {
                closeCameraWithResult({ kind: 'failed' });
              }}
              ref={setCameraRef}
            />
            <View style={{ position: 'absolute', top: 48, right: 20 }}>
              <Pressable onPress={() => closeCameraWithResult({ kind: 'cancelled' })} style={{ padding: 10, backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 20 }}>
                <Text className="text-white">{t('attendance.close', 'Close')}</Text>
              </Pressable>
            </View>
            <View style={{ position: 'absolute', top: 48, left: 20, right: 96 }}>
              <View style={{ backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 12, paddingVertical: 10, paddingHorizontal: 12 }}>
                <Text className="text-white font-bold">{t('attendance.cameraTitle', 'Take Attendance Photo')}</Text>
                <Text className="text-white/90 text-xs mt-1">
                  {t('attendance.cameraHint', 'Keep your face centered and clearly visible, then tap the capture button.')}
                </Text>
              </View>
            </View>
            <View style={{ position: 'absolute', bottom: 48, left: 0, right: 0, alignItems: 'center' }}>
              <Pressable
                onPress={handleTakePhotoInApp}
                disabled={isCapturing}
                style={{
                  width: 86,
                  height: 86,
                  borderRadius: 43,
                  borderWidth: 6,
                  borderColor: '#fff',
                  backgroundColor: isCapturing ? '#888' : '#fff',
                }}
              />
              <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 12 }}>
                <Camera size={16} color="#FFFFFF" />
                <Text className="text-white font-semibold ml-2">
                  {isCapturing ? t('attendance.capturing', 'Capturing...') : t('attendance.capturePhoto', 'Capture Photo')}
                </Text>
              </View>
            </View>
          </>
        ) : (
          <>
            <View style={{ flex: 1 }}>
              <Image source={{ uri: capturedUri }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
            </View>
            <View style={{ position: 'absolute', top: 48, left: 20, right: 20 }}>
              <View style={{ backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 12, paddingVertical: 10, paddingHorizontal: 12 }}>
                <Text className="text-white font-bold">{t('attendance.reviewTitle', 'Review Photo')}</Text>
                <Text className="text-white/90 text-xs mt-1">
                  {t('attendance.reviewHint', 'Use this photo if your face is clear. Retake if it is blurry or not centered.')}
                </Text>
              </View>
            </View>
            <View style={{ position: 'absolute', bottom: 36, left: 20, right: 20, flexDirection: 'row', justifyContent: 'space-between' }}>
              <Pressable onPress={() => setCapturedUri(null)} style={{ paddingVertical: 12, paddingHorizontal: 18, backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 12 }}>
                <Text className="text-white font-bold">{t('attendance.retake', 'Retake')}</Text>
              </Pressable>
              <Pressable onPress={handleUsePhoto} style={{ paddingVertical: 12, paddingHorizontal: 18, backgroundColor: '#2563EB', borderRadius: 12 }}>
                <Text className="text-white font-bold">{t('attendance.usePhoto', 'Use Photo')}</Text>
              </Pressable>
            </View>
          </>
        )}
      </View>
    </Modal>
  );

  return {
    captureAndUpload,
    isProcessing,
    statusMessage,
    cameraModal,
  };
}
