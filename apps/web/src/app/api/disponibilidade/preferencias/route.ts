import { NextResponse } from 'next/server';
import { updatePreferredWeekdaysSchema } from '@revezo/contracts';
import { setPreferredWeekdaysWithAudit } from '@revezo/db';
import { getSession, getCurrentUserContext } from '@/lib/auth-service';
import { can } from '@revezo/domain';

export async function POST(request: Request) {
  try {
    const session = await getSession();
    const userContext = await getCurrentUserContext();

    if (!session || !userContext) {
      return NextResponse.json({ success: false, error: 'Acesso não autorizado.' }, { status: 401 });
    }

    const body = await request.json();
    const parsed = updatePreferredWeekdaysSchema.safeParse(body);

    if (!parsed.success) {
      const firstError = parsed.error.issues[0]?.message || 'Dados inválidos.';
      return NextResponse.json({ success: false, error: firstError }, { status: 400 });
    }

    const targetUserId = parsed.data.targetUserId || session.userId;
    const allowed = can(userContext, 'availability:manage:own', { targetUserId });
    if (!allowed) {
      return NextResponse.json(
        { success: false, error: 'Você não tem permissão para gerenciar preferências deste usuário.' },
        { status: 403 }
      );
    }

    const ip = request.headers.get('x-forwarded-for') || request.headers.get('cf-connecting-ip') || undefined;

    await setPreferredWeekdaysWithAudit({
      userId: targetUserId,
      weekdays: parsed.data.weekdays,
      actorId: session.userId,
      ip,
    });

    return NextResponse.json({
      success: true,
      message: 'Preferências de dias atualizadas com sucesso.',
      preferredWeekdays: parsed.data.weekdays,
    });
  } catch (error: unknown) {
    console.error('Erro ao salvar preferências de disponibilidade:', error);
    const message = error instanceof Error ? error.message : 'Erro ao salvar preferências de disponibilidade.';
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }
}
