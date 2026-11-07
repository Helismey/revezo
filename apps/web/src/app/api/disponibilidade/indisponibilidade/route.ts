import { NextResponse } from 'next/server';
import { addUnavailablePeriodSchema, removeUnavailablePeriodSchema } from '@revezo/contracts';
import { addUnavailablePeriodWithAudit, removeUnavailablePeriodWithAudit } from '@revezo/db';
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
    const parsed = addUnavailablePeriodSchema.safeParse(body);

    if (!parsed.success) {
      const firstError = parsed.error.issues[0]?.message || 'Dados inválidos.';
      return NextResponse.json({ success: false, error: firstError }, { status: 400 });
    }

    const targetUserId = parsed.data.targetUserId || session.userId;
    const allowed = can(userContext, 'availability:manage:own', { targetUserId });
    if (!allowed) {
      return NextResponse.json(
        { success: false, error: 'Você não tem permissão para cadastrar indisponibilidade deste usuário.' },
        { status: 403 }
      );
    }

    const ip = request.headers.get('x-forwarded-for') || request.headers.get('cf-connecting-ip') || undefined;

    const created = await addUnavailablePeriodWithAudit({
      userId: targetUserId,
      from: parsed.data.from,
      to: parsed.data.to,
      actorId: session.userId,
      ip,
    });

    return NextResponse.json({
      success: true,
      message: 'Período de indisponibilidade adicionado com sucesso.',
      period: {
        id: created.id,
        from: created.from?.toISOString(),
        to: created.to?.toISOString(),
      },
    });
  } catch (error: unknown) {
    console.error('Erro ao adicionar período de indisponibilidade:', error);
    const message = error instanceof Error ? error.message : 'Erro ao cadastrar período de indisponibilidade.';
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }
}

export async function DELETE(request: Request) {
  try {
    const session = await getSession();
    const userContext = await getCurrentUserContext();

    if (!session || !userContext) {
      return NextResponse.json({ success: false, error: 'Acesso não autorizado.' }, { status: 401 });
    }

    const body = await request.json();
    const parsed = removeUnavailablePeriodSchema.safeParse(body);

    if (!parsed.success) {
      const firstError = parsed.error.issues[0]?.message || 'Dados inválidos.';
      return NextResponse.json({ success: false, error: firstError }, { status: 400 });
    }

    const targetUserId = parsed.data.targetUserId || session.userId;
    const allowed = can(userContext, 'availability:manage:own', { targetUserId });
    if (!allowed) {
      return NextResponse.json(
        { success: false, error: 'Você não tem permissão para remover indisponibilidade deste usuário.' },
        { status: 403 }
      );
    }

    const ip = request.headers.get('x-forwarded-for') || request.headers.get('cf-connecting-ip') || undefined;

    await removeUnavailablePeriodWithAudit({
      userId: targetUserId,
      availabilityId: parsed.data.availabilityId,
      actorId: session.userId,
      ip,
    });

    return NextResponse.json({
      success: true,
      message: 'Período de indisponibilidade removido com sucesso.',
    });
  } catch (error: unknown) {
    console.error('Erro ao remover período de indisponibilidade:', error);
    const message = error instanceof Error ? error.message : 'Erro ao remover período de indisponibilidade.';
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }
}
