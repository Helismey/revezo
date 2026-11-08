import { NextResponse } from 'next/server';
import { reviewSwapRequestSchema } from '@revezo/contracts';
import { approveSwapRequestWithLock } from '@revezo/db';
import { getSession, getCurrentUserContext } from '@/lib/auth-service';
import { notifySwapApproved } from '@/services/notifications/swap-and-sub-notifications';

export async function POST(request: Request) {
  try {
    const session = await getSession();
    const userContext = await getCurrentUserContext();

    if (!session || !userContext) {
      return NextResponse.json({ success: false, error: 'Não autorizado' }, { status: 401 });
    }

    const body = await request.json();
    const parsed = reviewSwapRequestSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0]?.message || 'Dados inválidos' },
        { status: 400 }
      );
    }

    const clientIp = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || '127.0.0.1';

    const result = await approveSwapRequestWithLock({
      swapRequestId: parsed.data.swapRequestId,
      reviewerId: session.userId,
      action: parsed.data.action,
      notes: parsed.data.notes,
      ip: clientIp,
    });

    if (parsed.data.action === 'APPROVE') {
      notifySwapApproved({
        swapRequestId: parsed.data.swapRequestId,
      }).catch((err) => console.error('Erro ao notificar aprovação de troca:', err));
    }

    return NextResponse.json({ success: true, data: result });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Erro ao revisar pedido de troca';
    return NextResponse.json({ success: false, error: msg }, { status: 400 });
  }
}
