import { NextResponse } from 'next/server';
import { respondSwapRequestSchema } from '@revezo/contracts';
import { respondSwapRequestWithAudit } from '@revezo/db';
import { getSession } from '@/lib/auth-service';

export async function POST(request: Request) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ success: false, error: 'Não autorizado' }, { status: 401 });
    }

    const body = await request.json();
    const parsed = respondSwapRequestSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0]?.message || 'Dados inválidos' },
        { status: 400 }
      );
    }

    const clientIp = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || '127.0.0.1';

    const updated = await respondSwapRequestWithAudit({
      swapRequestId: parsed.data.swapRequestId,
      userId: session.userId,
      action: parsed.data.action,
      reason: parsed.data.reason,
      ip: clientIp,
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Erro ao responder pedido de troca';
    return NextResponse.json({ success: false, error: msg }, { status: 400 });
  }
}
