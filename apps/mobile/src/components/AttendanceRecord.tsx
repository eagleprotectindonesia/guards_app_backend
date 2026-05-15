import React, { useState } from 'react';
import { Image, Modal, Pressable, View } from 'react-native';
import { useCustomToast } from '../hooks/useCustomToast';
import { Box } from '@/components/ui/box';
import { Button, ButtonText, ButtonSpinner } from '@/components/ui/button';
import { Heading } from '@/components/ui/heading';
import { Text } from '@/components/ui/text';
import { VStack } from '@/components/ui/vstack';
import * as Location from 'expo-location';
import * as ImagePicker from 'expo-image-picker';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { File } from 'expo-file-system';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { client } from '../api/client';
import { useTranslation } from 'react-i18next';
import { ShiftWithRelations } from '@repo/types';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { Camera } from 'lucide-react-native';
import { queryKeys } from '../api/queryKeys';
import { uploadToS3 } from '../api/upload';
import {
  getEmployeeAttendanceCheckinErrorPayload,
  resolveEmployeeAttendanceCheckinErrorMessage,
} from '@repo/shared';

type AttendanceRecordProps = {
  shift: ShiftWithRelations;
  onAttendanceRecorded?: () => void;
};

const ATTENDANCE_PHOTO_MAX_DIMENSION = 1280;
const ATTENDANCE_PHOTO_QUALITY = 0.8;
const ATTENDANCE_PHOTO_CONTENT_TYPE = 'image/webp';

type AttendancePhotoUpload = {
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

export default function AttendanceRecord({ shift, onAttendanceRecorded }: AttendanceRecordProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<string>('');
  const [cameraOpen, setCameraOpen] = useState(false);
  const [capturedUri, setCapturedUri] = useState<string | null>(null);
  const [isCapturing, setIsCapturing] = useState(false);
  const [cameraFailed, setCameraFailed] = useState(false);
  const [cameraResolve, setCameraResolve] = useState<((asset: ImagePicker.ImagePickerAsset | null) => void) | null>(null);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [cameraRef, setCameraRef] = useState<CameraView | null>(null);
  const toast = useCustomToast();

  const attendanceMutation = useMutation({
    mutationFn: async (payload: {
      location: { lat: number; lng: number };
      picture?: string;
      metadata?: Record<string, unknown>;
    }) => {
      const response = await client.post(`/api/employee/shifts/${shift.id}/attendance`, {
        shiftId: shift.id,
        location: payload.location,
        picture: payload.picture,
        metadata: payload.metadata,
      });
      return response.data;
    },
    onSuccess: async () => {
      setStatus(t('attendance.success'));
      queryClient.invalidateQueries({ queryKey: queryKeys.shifts.active });
      if (onAttendanceRecorded) onAttendanceRecorded();
    },
    onError: (error: any) => {
      const errorData = getEmployeeAttendanceCheckinErrorPayload(error);
      const msg = resolveEmployeeAttendanceCheckinErrorMessage(
        t,
        {
          code: errorData.code,
          fallbackMessage: errorData.error || errorData.message || error.message,
          details: errorData.details,
        },
        t('attendance.fail'),
        'attendance'
      );
      setStatus(t('attendance.failPrefix') + msg);
      toast.error('Error', msg);
    },
  });

  const preflightAttendanceMutation = useMutation({
    mutationFn: async (location: { lat: number; lng: number }) => {
      const response = await client.post(`/api/employee/shifts/${shift.id}/attendance`, {
        shiftId: shift.id,
        location,
        validateOnly: true,
      });
      return response.data;
    },
  });

  const buildResizeAction = (width?: number, height?: number) => {
    if (!width || !height) return null;

    const longestSide = Math.max(width, height);
    if (longestSide <= ATTENDANCE_PHOTO_MAX_DIMENSION) return null;

    if (width >= height) {
      return { resize: { width: ATTENDANCE_PHOTO_MAX_DIMENSION } };
    }

    return { resize: { height: ATTENDANCE_PHOTO_MAX_DIMENSION } };
  };

  const captureWithSystemCamera = async (): Promise<ImagePicker.ImagePickerAsset | null> => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();

    if (permission.status !== 'granted') {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      toast.error(
        t('attendance.permissionDeniedTitle'),
        t('officeAttendance.errors.cameraRequired', 'Camera permission is required to record attendance.')
      );
      return null;
    }

    setStatus(t('officeAttendance.takingPhoto', 'Taking attendance photo'));

    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: false,
      mediaTypes: ['images'],
      cameraType: ImagePicker.CameraType.front,
      quality: 1,
    });

    if (result.canceled || !result.assets[0]?.uri) {
      setStatus(t('officeAttendance.errors.photoRequired', 'Attendance photo is required.'));
      return null;
    }
    return result.assets[0];
  };

  const captureWithInAppCamera = async (): Promise<ImagePicker.ImagePickerAsset | null> => {
    if (!cameraPermission?.granted) {
      const permission = await requestCameraPermission();
      if (!permission.granted) {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        toast.error(
          t('attendance.permissionDeniedTitle'),
          t('officeAttendance.errors.cameraRequired', 'Camera permission is required to record attendance.')
        );
        return null;
      }
    }

    setCapturedUri(null);
    setCameraFailed(false);
    setCameraOpen(true);

    return await new Promise(resolve => {
      setCameraResolve(() => resolve);
    });
  };

  const captureAndUploadAttendancePhoto = async (): Promise<AttendancePhotoUpload | null> => {
    setStatus(t('officeAttendance.takingPhoto', 'Taking attendance photo'));

    let asset = await captureWithInAppCamera();
    if (!asset && cameraFailed) {
      asset = await captureWithSystemCamera();
    }
    if (!asset?.uri) return null;

    const resizeAction = buildResizeAction(asset.width, asset.height);
    const ImageManipulator = await import('expo-image-manipulator');

    setStatus(t('officeAttendance.optimizingPhoto', 'Optimizing attendance photo'));

    const optimized = await ImageManipulator.manipulateAsync(asset.uri, resizeAction ? [resizeAction] : [], {
      compress: ATTENDANCE_PHOTO_QUALITY,
      format: ImageManipulator.SaveFormat.WEBP,
    });
    const optimizedFile = new File(optimized.uri);

    if (!optimizedFile.exists || optimizedFile.size == null || optimizedFile.size <= 0) {
      throw new Error('Optimized attendance photo is empty');
    }

    setStatus(t('officeAttendance.uploadingPhoto', 'Uploading attendance photo'));

    const upload = await uploadToS3(
      optimized.uri,
      `attendance-${Date.now()}.webp`,
      ATTENDANCE_PHOTO_CONTENT_TYPE,
      optimizedFile.size,
      {
        folder: 'attendance',
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
  };

  const handleRecordAttendance = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setStatus(t('attendance.requestingPermission'));
    let { status: permStatus } = await Location.requestForegroundPermissionsAsync();

    if (permStatus !== 'granted') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setStatus(t('attendance.permissionDenied'));
      toast.error(t('attendance.permissionDeniedTitle'), t('attendance.locationRequired'));
      return;
    }

    setStatus(t('attendance.gettingLocation'));
    try {
      let location = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      setStatus(t('attendance.recording'));
      await preflightAttendanceMutation.mutateAsync({
        lat: location.coords.latitude,
        lng: location.coords.longitude,
      });

      const photoUpload = await captureAndUploadAttendancePhoto();
      if (!photoUpload) {
        return;
      }

      setStatus(t('attendance.recording'));
      attendanceMutation.mutate({
        location: {
          lat: location.coords.latitude,
          lng: location.coords.longitude,
        },
        picture: photoUpload.key,
        metadata: photoUpload.metadata,
      });
    } catch (err: any) {
      const errorData = getEmployeeAttendanceCheckinErrorPayload(err);
      const isApiError = Boolean(errorData.code || errorData.error || errorData.message);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);

      if (isApiError) {
        const msg = resolveEmployeeAttendanceCheckinErrorMessage(
          t,
          {
            code: errorData.code,
            fallbackMessage: errorData.error || errorData.message || err?.message,
            details: errorData.details,
          },
          t('attendance.fail'),
          'attendance'
        );
        setStatus(t('attendance.failPrefix') + msg);
        toast.error('Error', msg);
        return;
      }

      console.error(err);
      setStatus(t('attendance.locationFetchError'));
      toast.error(t('attendance.locationErrorTitle'), t('attendance.locationErrorMessage'));
    }
  };

  const closeCameraWithResult = (asset: ImagePicker.ImagePickerAsset | null) => {
    const resolver = cameraResolve;
    setCameraResolve(null);
    setCameraOpen(false);
    setCapturedUri(null);
    if (resolver) resolver(asset);
  };

  const handleTakePhotoInApp = async () => {
    if (!cameraRef || isCapturing) return;
    setIsCapturing(true);
    try {
      const photo = await cameraRef.takePictureAsync({ quality: 1 });
      if (photo?.uri) {
        setCapturedUri(photo.uri);
      }
    } catch (error) {
      console.error('In-app camera capture failed:', error);
      setCameraFailed(true);
      closeCameraWithResult(null);
    } finally {
      setIsCapturing(false);
    }
  };

  const handleUsePhoto = () => {
    if (!capturedUri) {
      closeCameraWithResult(null);
      return;
    }
    closeCameraWithResult({
      uri: capturedUri,
      width: 0,
      height: 0,
      fileSize: undefined,
      mimeType: 'image/jpeg',
      assetId: null,
      base64: null,
      exif: null,
      fileName: undefined,
      type: 'image',
      duration: null,
      pairedVideoAsset: null,
    });
  };

  const hasAttendance = !!shift.attendance;

  // Calculate late status
  const ATTENDANCE_GRACE_MINS = 5;
  const now = new Date();
  const startMs = new Date(shift.startsAt).getTime();
  const graceEndMs = startMs + ATTENDANCE_GRACE_MINS * 60000;

  // Check if attendance was marked as late due to forgiveness or actual lateness
  const isLateAttendance = hasAttendance && shift.attendance?.status === 'late';

  // Check if it's currently late and no attendance has been recorded
  const isLateTime = !hasAttendance && now.getTime() > graceEndMs;

  if (hasAttendance) {
    return (
      <Box
        className={`bg-background-900 ${
          isLateAttendance ? 'border-warning-500' : 'border-success-500'
        } p-5 rounded-2xl border mb-4 shadow-xl`}
      >
        <Heading
          size="md"
          className={`mb-1 ${isLateAttendance ? 'text-warning-500' : 'text-success-500'}`}
        >
          {isLateAttendance ? t('attendance.lateTitle') : t('attendance.recordedTitle')}
        </Heading>
        <Text className="text-typography-300" size="sm">
          {isLateAttendance
            ? t('attendance.recordedLateAt', { date: format(new Date(shift.attendance!.recordedAt), 'PPpp') })
            : t('attendance.recordedAt', { date: format(new Date(shift.attendance!.recordedAt), 'PPpp') })}
        </Text>
      </Box>
    );
  }

  return (
    <>
      <Modal visible={cameraOpen} animationType="slide" transparent={false} onRequestClose={() => closeCameraWithResult(null)}>
        <View style={{ flex: 1, backgroundColor: '#000' }}>
          {!capturedUri ? (
            <>
              <CameraView
                style={{ flex: 1 }}
                facing="front"
                onMountError={() => {
                  setCameraFailed(true);
                  closeCameraWithResult(null);
                }}
                ref={setCameraRef}
              />
              <View style={{ position: 'absolute', top: 48, right: 20 }}>
                <Pressable onPress={() => closeCameraWithResult(null)} style={{ padding: 10, backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 20 }}>
                  <Text className="text-white">{t('attendance.close', 'Close')}</Text>
                </Pressable>
              </View>
              <View style={{ position: 'absolute', top: 48, left: 20, right: 96 }}>
                <View style={{ backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 12, paddingVertical: 10, paddingHorizontal: 12 }}>
                  <Text className="text-white font-bold">{t('attendance.cameraTitle', 'Take Attendance Photo')}</Text>
                  <Text className="text-white/90 text-xs mt-1">
                    {t(
                      'attendance.cameraHint',
                      'Keep your face centered and clearly visible, then tap the capture button.'
                    )}
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
                    {t(
                      'attendance.reviewHint',
                      'Use this photo if your face is clear. Retake if it is blurry or not centered.'
                    )}
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

      <Box
        className={`bg-background-900 ${
          isLateTime ? 'border-error-500' : 'border-white/10'
        } p-5 rounded-2xl border mb-4 shadow-xl`}
      >
        <VStack space="md">
        <Heading size="md" className="text-white font-bold">
          {isLateTime ? t('attendance.notRecordedTitle') : t('attendance.requiredTitle')}
        </Heading>

        {isLateTime ? (
          <Text className="text-error-400 font-bold" size="md">
            {t('attendance.lateMessage')}
          </Text>
        ) : (
          <Text className="text-typography-400">{t('attendance.requiredMessage')}</Text>
        )}

        {status ? (
          <Text size="sm" className="text-info-400 font-medium">
            {status}
          </Text>
        ) : null}

        {/* Custom Button Container to allow Gradient */}
        <Button
          size="lg"
          action={isLateTime ? 'negative' : 'primary'}
          onPress={handleRecordAttendance}
          isDisabled={attendanceMutation.isPending}
          className="p-0 overflow-hidden rounded-xl shadow-lg"
          style={{
            // @ts-ignore
            boxShadow: isLateTime ? '0 8px 25px rgba(220, 38, 38, 0.4)' : '0 8px 25px rgba(37, 99, 235, 0.4)',
          }}
        >
          <LinearGradient
            colors={isLateTime ? ['#DC2626', '#991B1B'] : ['#2563EB', '#1D4ED8']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={{
              width: '100%',
              height: '100%',
              justifyContent: 'center',
              alignItems: 'center',
              flexDirection: 'row',
            }}
          >
            {attendanceMutation.isPending ? <ButtonSpinner className="mr-2 text-white" /> : null}
            <ButtonText className="text-white font-bold uppercase tracking-[1px]">
              {isLateTime
                ? t('attendance.submitLateButton', { defaultValue: 'Record Late Attendance' })
                : t('attendance.submitButton')}
            </ButtonText>
          </LinearGradient>
        </Button>
        </VStack>
      </Box>
    </>
  );
}
