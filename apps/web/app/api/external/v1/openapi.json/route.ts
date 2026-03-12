import { NextResponse } from 'next/server';
import { getOpenApiSpec } from '@/lib/openapi';

export async function GET(): Promise<Response> {
  const spec = getOpenApiSpec();
  return NextResponse.json(spec);
}
