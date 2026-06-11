import { NextRequest, NextResponse } from 'next/server';
import { redis } from '@repo/database/redis';
import { panicWebhookPayloadSchema } from '@repo/validations';
import { ZodError } from 'zod';

export async function POST(request: NextRequest) {
  try {
    const json = await request.json();
    const result = panicWebhookPayloadSchema.parse(json);
    const { unresolvedPanics } = result;

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
    if (error instanceof ZodError) {
      return NextResponse.json({ error: error.issues }, { status: 400 });
    }
    console.error('Error in panic webhook handler:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
