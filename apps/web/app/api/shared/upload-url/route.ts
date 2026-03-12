import { NextRequest, NextResponse } from 'next/server';
import { getPresignedUploadUrl } from '@/lib/s3';

export async function POST(req: NextRequest) {
  try {
    const {
      fileName,
      contentType,
      folder = 'uploads',
      fileSize,
      conversationId,
      messageId,
      fileType,
    } = await req.json();

    if (!fileName || !contentType) {
      return NextResponse.json({ error: 'Missing fileName or contentType' }, { status: 400 });
    }

    // Validate file size (e.g., 100MB limit for videos)
    const MAX_FILE_SIZE = 100 * 1024 * 1024;
    if (fileSize && fileSize > MAX_FILE_SIZE) {
      return NextResponse.json({ error: 'File too large (max 100MB)' }, { status: 400 });
    }

    // Validate file type
    const allowedTypes = [
      'image/jpeg',
      'image/png',
      'image/webp',
      'image/gif',
      'video/mp4',
      'video/quicktime',
      'video/x-matroska',
      'video/webm',
      'application/pdf',
    ];
    if (!allowedTypes.includes(contentType)) {
      return NextResponse.json({ error: 'Invalid file type' }, { status: 400 });
    }

    if (folder === 'chat' && (!conversationId || !messageId)) {
      console.warn('[Presigned Upload API] Chat upload missing metadata; falling back to generic key', {
        folder,
        hasConversationId: Boolean(conversationId),
        hasMessageId: Boolean(messageId),
        fileName,
        contentType,
        fileType: fileType || null,
      });
    }

    const { uploadUrl, publicUrl, key } = await getPresignedUploadUrl(fileName, contentType, {
      folder,
      conversationId,
      messageId,
      fileType,
    });

    return NextResponse.json({
      uploadUrl,
      publicUrl,
      key,
      fileName,
      contentType,
    });
  } catch (error) {
    console.error('[Presigned URL API] Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
