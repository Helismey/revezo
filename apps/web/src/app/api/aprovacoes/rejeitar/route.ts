import { NextResponse } from 'next/server';
import { rejectMemberSchema } from '@revezo/contracts';
import { prisma } from '@revezo/db';
import { getSession, getCurrentUserContext } from '@/lib/auth-service';
import { can } from '@revezo/domain';
import { notifyRegistrationRejected } from '@/services/notifications/swap-and-sub-notifications';

export async function POST(request: Request) {
  try {
    const session = await getSession();
    const userContext = await getCurrentUserContext();

    if (!session || !userContext) {
      return NextResponse.json({ success: false, error: 'Não autorizado' }, { status: 401 });
    }

    const body = await request.json();
    const parsed = rejectMemberSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.errors[0]?.message || 'Dados inválidos' },
        { status: 400 }
      );
    }

    const targetUser = await prisma.user.findUnique({
      where: { id: parsed.data.userId },
    });

    if (!targetUser) {
      return NextResponse.json({ success: false, error: 'Usuário não encontrado' }, { status: 404 });
    }

    const managedDeptIds = userContext.departmentMemberships
      .filter((m) => m.role === 'MANAGER')
      .map((m) => m.departmentId);

    const allowed = can(userContext, 'registration:reject', {
      churchId: targetUser.churchId || undefined,
      departmentId: parsed.data.departmentId,
      departmentIds: managedDeptIds,
    });

    if (!allowed) {
      return NextResponse.json(
        { success: false, error: 'Você não tem permissão para rejeitar cadastros desta congregação ou departamento' },
        { status: 403 }
      );
    }

    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: parsed.data.userId },
        data: { status: 'REJECTED' },
      });

      await tx.auditLog.create({
        data: {
          actorId: session.userId,
          churchId: targetUser.churchId || null,
          action: 'REGISTRATION_REJECTED',
          targetType: 'User',
          targetId: parsed.data.userId,
          result: 'SUCCESS',
          meta: { reason: parsed.data.reason, churchId: targetUser.churchId || null },
        },
      });
    });

    // 4. Notifica o voluntário sobre a recusa (assíncrono)
    notifyRegistrationRejected({
      userId: parsed.data.userId,
      reason: parsed.data.reason || null,
      churchId: targetUser.churchId || null,
    }).catch((notifErr) => {
      console.warn('Aviso: falha ao despachar notificação de recusa:', notifErr);
    });

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    console.error('Erro ao rejeitar cadastro:', err);
    return NextResponse.json(
      { success: false, error: 'Ocorreu um erro ao rejeitar o cadastro.' },
      { status: 500 }
    );
  }
}
