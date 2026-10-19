import { NextResponse } from 'next/server';
import { consumeConfirmationTokenSchema, verifyConfirmationTokenQuerySchema } from '@revezo/contracts';
import {
  verifyConfirmationToken,
  consumeConfirmationTokenWithAudit,
  prisma,
} from '@revezo/db';
import { HybridRateLimiter } from '@revezo/domain';
import {
  notifyAutoSubstitution,
  notifyManagerOpenSlot,
} from '@/services/notifications/swap-and-sub-notifications';

// Rate limiter por IP para prevenir abusos e enumeração de URLs públicas
const publicActionLimiter = new HybridRateLimiter({
  prefix: 'confirm-token',
  maxAttempts: 25,
  windowMs: 60 * 1000,
  blockDurationMs: 5 * 60 * 1000,
});

export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const clientIp = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || '127.0.0.1';
    const rateCheck = await publicActionLimiter.recordAttempt(clientIp);

    if (rateCheck.blocked) {
      return NextResponse.json(
        {
          success: false,
          error: 'Muitas requisições. Por favor, aguarde alguns instantes e tente novamente.',
        },
        { status: 429 }
      );
    }

    const { token } = await params;
    const parsed = verifyConfirmationTokenQuerySchema.safeParse({ token });

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: 'Link de confirmação com formato inválido.' },
        { status: 400 }
      );
    }

    const church = await prisma.churchSettings.findFirst();
    const result = await verifyConfirmationToken(token);

    if (!result.valid) {
      return NextResponse.json(
        {
          success: false,
          error: result.message || 'Link inválido ou expirado.',
          code: result.error,
        },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      church: {
        name: church?.name || 'Igreja',
        primaryColor: church?.primaryColor || '#1E40AF',
        logoUrl: church?.logoUrl || null,
      },
      assignment: result.data,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Erro ao verificar confirmação';
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const clientIp = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || '127.0.0.1';
    const rateCheck = await publicActionLimiter.recordAttempt(clientIp);

    if (rateCheck.blocked) {
      return NextResponse.json(
        {
          success: false,
          error: 'Muitas requisições. Por favor, aguarde alguns instantes e tente novamente.',
        },
        { status: 429 }
      );
    }

    const { token } = await params;
    const body = await request.json();

    const parsed = consumeConfirmationTokenSchema.safeParse({
      token,
      action: body.action,
      reason: body.reason,
    });

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.errors[0]?.message || 'Dados inválidos' },
        { status: 400 }
      );
    }

    const result = await consumeConfirmationTokenWithAudit({
      rawToken: token,
      action: parsed.data.action,
      reason: parsed.data.reason,
      ip: clientIp,
    });

    if (result.substituteAssignmentId) {
      notifyAutoSubstitution({
        substituteAssignmentId: result.substituteAssignmentId,
        originalAssignmentId: result.assignmentId,
        reason: parsed.data.reason,
        actorId: 'TOKEN_PUBLIC_ACTION',
      }).catch((err) => console.error('Erro ao notificar substituto via token:', err));
    } else if (parsed.data.action === 'DECLINE') {
      notifyManagerOpenSlot({
        assignmentId: result.assignmentId,
        reason: parsed.data.reason,
        diagnosis: result.diagnosis,
      }).catch((err) => console.error('Erro ao notificar gestor sobre vaga aberta via token:', err));
    }

    return NextResponse.json({
      success: true,
      data: result,
      message:
        parsed.data.action === 'CONFIRM'
          ? 'Presença confirmada com sucesso! Que Deus abençoe seu ministério.'
          : 'Agradecemos por nos avisar! Seu ministério foi informado sobre o imprevisto.',
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Erro ao processar confirmação';
    return NextResponse.json({ success: false, error: msg }, { status: 400 });
  }
}
