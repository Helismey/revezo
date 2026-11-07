import { NextResponse } from 'next/server';
import { approveMemberSchema } from '@revezo/contracts';
import { prisma } from '@revezo/db';
import { getSession, getCurrentUserContext } from '@/lib/auth-service';
import { can } from '@revezo/domain';
import { notifyRegistrationApproved } from '@/services/notifications/swap-and-sub-notifications';

export async function POST(request: Request) {
  try {
    const session = await getSession();
    const userContext = await getCurrentUserContext();

    if (!session || !userContext) {
      return NextResponse.json({ success: false, error: 'Não autorizado' }, { status: 401 });
    }

    const body = await request.json();
    const parsed = approveMemberSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0]?.message || 'Dados inválidos' },
        { status: 400 }
      );
    }

    const [targetUser, dept] = await Promise.all([
      prisma.user.findUnique({ where: { id: parsed.data.userId } }),
      prisma.department.findUnique({ where: { id: parsed.data.departmentId } }),
    ]);

    if (!targetUser) {
      return NextResponse.json({ success: false, error: 'Usuário não encontrado' }, { status: 404 });
    }

    const targetChurchId = targetUser.churchId || dept?.churchId || undefined;

    const allowed = can(userContext, 'registration:approve', {
      churchId: targetChurchId,
      departmentId: parsed.data.departmentId,
    });

    if (!allowed) {
      return NextResponse.json(
        { success: false, error: 'Você não tem permissão para aprovar cadastros nesta congregação ou departamento' },
        { status: 403 }
      );
    }

    await prisma.$transaction(async (tx) => {
      // 1. Atualiza status para ACTIVE e garante congregação vinculada
      await tx.user.update({
        where: { id: parsed.data.userId },
        data: {
          status: 'ACTIVE',
          ...(targetChurchId && !targetUser.churchId ? { churchId: targetChurchId } : {}),
        },
      });

      // 2. Cria vínculo de membro com o departamento
      const member = await tx.departmentMember.upsert({
        where: {
          userId_departmentId: {
            userId: parsed.data.userId,
            departmentId: parsed.data.departmentId,
          },
        },
        update: { role: 'MEMBER' },
        create: {
          userId: parsed.data.userId,
          departmentId: parsed.data.departmentId,
          role: 'MEMBER',
        },
      });

      // 3. Vincula as funções selecionadas
      for (const funcId of parsed.data.functionIds) {
        await tx.memberFunction.upsert({
          where: {
            memberId_functionId: {
              memberId: member.id,
              functionId: funcId,
            },
          },
          update: {},
          create: {
            memberId: member.id,
            functionId: funcId,
          },
        });
      }

      // 4. Trilha de auditoria
      await tx.auditLog.create({
        data: {
          actorId: session.userId,
          churchId: targetChurchId || null,
          action: 'REGISTRATION_APPROVED',
          targetType: 'User',
          targetId: parsed.data.userId,
          result: 'SUCCESS',
          meta: { departmentId: parsed.data.departmentId, churchId: targetChurchId || null },
        },
      });
    });

    // 5. Notifica o voluntário de que seu acesso foi liberado (assíncrono)
    notifyRegistrationApproved({
      userId: parsed.data.userId,
      departmentId: parsed.data.departmentId,
      churchId: targetChurchId || null,
    }).catch((notifErr) => {
      console.warn('Aviso: falha ao despachar notificação de aprovação:', notifErr);
    });

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    console.error('Erro ao aprovar cadastro:', err);
    return NextResponse.json(
      { success: false, error: 'Ocorreu um erro ao aprovar o cadastro.' },
      { status: 500 }
    );
  }
}
