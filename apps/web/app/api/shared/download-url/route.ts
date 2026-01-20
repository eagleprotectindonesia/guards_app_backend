import { NextRequest, NextResponse } from 'next/server';
import { getPresignedDownloadUrl } from '@/lib/s3';

export async function POST(req: NextRequest) {
  try {
    const { key } = await req.json();

    if (!key) {
      return NextResponse.json({ error: 'No key provided' }, { status: 400 });
    }

    const downloadUrl = await getPresignedDownloadUrl(key);

    return NextResponse.json({ url: downloadUrl });
  } catch (error) {
    console.error('[Download URL API] Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
