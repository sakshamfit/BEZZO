import { NextResponse } from 'next/server';
import { handleMockRoute } from '../../lib/mock-service';

export async function GET() {
  const result = handleMockRoute('/health', 'GET', {});
  return NextResponse.json(result.payload, { status: result.status });
}
