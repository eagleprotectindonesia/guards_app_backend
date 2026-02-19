import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';

export async function POST(req: NextRequest) {
  const secret = process.env.INTERNAL_REVALIDATE_SECRET;
  const token = req.headers.get('x-revalidate-token');

  if (!secret || token !== secret) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const paths = body.paths;

    if (paths && Array.isArray(paths)) {
      paths.forEach((path: string) => {
        console.log(`[API:Revalidate] Revalidating path: ${path}`);
        revalidatePath(path);
      });
    }

    return NextResponse.json({ revalidated: true, now: Date.now() }, { status: 200 });
  } catch {
    return NextResponse.json({ message: 'Invalid request body' }, { status: 400 });
  }
}
