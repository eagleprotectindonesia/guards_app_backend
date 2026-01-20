import { NextRequest, NextResponse } from 'next/server';
import { uploadFile } from '@/lib/s3';

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const folder = (formData.get('folder') as string) || 'uploads';

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    // Validate file size (e.g., 5MB limit)
    const MAX_FILE_SIZE = 5 * 1024 * 1024;
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: 'File too large (max 5MB)' }, { status: 400 });
    }

    // Validate file type
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf'];
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json({ error: 'Invalid file type' }, { status: 400 });
    }

    // Convert file to buffer and upload
    const buffer = Buffer.from(await file.arrayBuffer());
    const { url, key } = await uploadFile(buffer, file.name, file.type, folder);

    return NextResponse.json({
      url,
      key,
      fileName: file.name,
      contentType: file.type,
      size: file.size,
    });
  } catch (error) {
    console.error('[Server Upload API] Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
