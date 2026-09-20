import { NextResponse } from 'next/server';
import { handleMockRoute } from '../../lib/mock-service';

export async function GET() {
  const result = handleMockRoute('/version', 'GET', {});
  return NextResponse.json(result.payload, { status: result.status });
}
