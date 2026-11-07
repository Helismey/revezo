import { NextResponse } from 'next/server';
import { createSwapRequestSchema } from '@revezo/contracts';
import { createSwapRequestWithAudit } from '@revezo/db';
import { getSession, getCurrentUserContext } from '@/lib/auth-service';
import { notifySwapRequested } from '@/services/notifications/swap-and-sub-notifications';

export async function POST(request: Request) {
  try {
    const session = await getSession();
    const userContext = await getCurrentUserContext();

    if (!session || !userContext) {
      return NextResponse.json({ success: false, error: 'Não autorizado' }, { status: 401 });
    }

    const body = await request.json();
    const parsed = createSwapRequestSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0]?.message || 'Dados inválidos' },
        { status: 400 }
      );
    }

    const clientIp = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || '127.0.0.1';

    const swap = await createSwapRequestWithAudit({
      assignmentId: parsed.data.assignmentId,
      requesterId: session.userId,
      targetUserId: parsed.data.targetUserId,
      targetAssignmentId: parsed.data.targetAssignmentId,
      reason: parsed.data.reason,
      ip: clientIp,
    });

    if (parsed.data.targetUserId) {
      notifySwapRequested({
        swapRequestId: swap.id,
      }).catch((err) => console.error('Erro ao notificar solicitação de troca:', err));
    }

    return NextResponse.json({ success: true, data: swap });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Erro ao solicitar troca de escala';
    return NextResponse.json({ success: false, error: msg }, { status: 400 });
  }
}
