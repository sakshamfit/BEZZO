import { NextRequest, NextResponse } from 'next/server';
import { handleMockRoute } from '../../../../lib/mock-service';

async function handle(req: NextRequest, { params }: { params: Promise<{ slug: string[] }> }) {
  const resolvedParams = await params;
  const slug = resolvedParams.slug || [];
  const path = `/api/v1/${slug.join('/')}`;
  const method = req.method;

  const url = new URL(req.url);
  const query: Record<string, string> = {};
  url.searchParams.forEach((value, key) => {
    query[key] = value;
  });

  let body: unknown = undefined;
  if (method !== 'GET' && method !== 'HEAD') {
    try {
      body = await req.json();
    } catch {
      body = undefined;
    }
  }

  const result = handleMockRoute(path, method, query, body);
  return NextResponse.json(result.payload, { status: result.status });
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ slug: string[] }> }) {
  return handle(req, ctx);
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ slug: string[] }> }) {
  return handle(req, ctx);
}

export async function PUT(req: NextRequest, ctx: { params: Promise<{ slug: string[] }> }) {
  return handle(req, ctx);
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ slug: string[] }> }) {
  return handle(req, ctx);
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ slug: string[] }> }) {
  return handle(req, ctx);
}
