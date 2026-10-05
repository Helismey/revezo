import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';
import { prisma } from '@revezo/db';

export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET?.trim();
  const authHeader = req.headers.get('authorization');

  if (process.env.NODE_ENV === 'production' && !cronSecret) {
    return NextResponse.json(
      { success: false, error: 'CRON_SECRET não configurado no servidor em produção.' },
      { status: 500 }
    );
  }

  if (cronSecret) {
    const expected = `Bearer ${cronSecret}`;
    const provided = authHeader || '';
    const bufA = Buffer.from(provided);
    const bufB = Buffer.from(expected);
    const isValid = bufA.length === bufB.length && timingSafeEqual(bufA, bufB);

    if (!isValid) {
      return NextResponse.json(
        { success: false, error: 'Autorização inválida para execução do keepalive.' },
        { status: 401 }
      );
    }
  }

  const startTime = Date.now();
  try {
    // Consulta ultraleve para acordar e renovar a atividade da instância no PostgreSQL
    await prisma.$queryRaw`SELECT 1;`;
    const latencyMs = Date.now() - startTime;

    return NextResponse.json({
      success: true,
      status: 'ok',
      database: 'connected',
      latencyMs,
      timestamp: new Date().toISOString(),
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Falha desconhecida';
    console.error('[Cron Keepalive] Erro ao conectar ao banco:', errorMsg);

    return NextResponse.json(
      {
        success: false,
        status: 'error',
        database: 'disconnected',
        error: 'Falha ao comunicar com o banco de dados.',
        timestamp: new Date().toISOString(),
      },
      { status: 503 }
    );
  }
}
