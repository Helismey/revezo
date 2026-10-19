import { NextResponse } from 'next/server';
import { prisma } from '@revezo/db';

export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({
      status: 'ok',
      database: 'connected',
      service: 'revezo-web',
      timestamp: new Date().toISOString(),
    });
  } catch {
    return NextResponse.json(
      {
        status: 'degraded',
        database: 'disconnected',
        service: 'revezo-web',
        timestamp: new Date().toISOString(),
      },
      { status: 503 }
    );
  }
}
