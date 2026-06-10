import { NextRequest, NextResponse } from 'next/server';
import { redis } from '@repo/database/redis';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { unresolvedPanics } = body;

    if (!unresolvedPanics || !Array.isArray(unresolvedPanics)) {
      return NextResponse.json(
        { error: 'Invalid payload: unresolvedPanics must be an array' },
        { status: 400 }
      );
    }

    // Store the unresolvedPanics in redis (overwriting the cache value)
    await redis.set('webhooks:unresolved_panics', JSON.stringify(unresolvedPanics));

    // Publish event to Redis for real-time Socket.io clients
    await redis.publish('webhooks:panic', JSON.stringify({ unresolvedPanics }));

    return NextResponse.json({
      success: true,
      message: 'Unresolved panics cache updated successfully',
      count: unresolvedPanics.length,
    });
  } catch (error) {
    console.error('Error in panic webhook handler:', error);
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}
