import { NextResponse } from 'next/server';
import { assignElderSchema } from '@revezo/contracts';
import { prisma } from '@revezo/db';
import { getSession, getCurrentUserContext } from '@/lib/auth-service';
import { can } from '@revezo/domain';

export async function POST(request: Request) {
  try {
    const session = await getSession();
    const userContext = await getCurrentUserContext();

    if (!session || !userContext) {
      return NextResponse.json({ success: false, error: 'Não autorizado' }, { status: 401 });
    }

    const body = await request.json();
    const parsed = assignElderSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0]?.message || 'Dados inválidos' },
        { status: 400 }
      );
    }

    const { userId, churchId } = parsed.data;

    // Apenas ADMIN_MASTER ou PASTOR podem vincular anciãos
    const allowed = can(userContext, 'church:elder:assign', { churchId });
    if (!allowed) {
      return NextResponse.json(
        { success: false, error: 'Apenas a liderança pastoral ou administradores gerais podem vincular anciãos' },
        { status: 403 }
      );
    }

    // Verifica existência da congregação
    const church = await prisma.church.findUnique({
      where: { id: churchId },
    });

    if (!church || !church.active) {
      return NextResponse.json(
        { success: false, error: 'Congregação não encontrada ou inativa' },
        { status: 404 }
      );
    }

    // Busca usuário alvo
    const targetUser = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!targetUser) {
      return NextResponse.json(
        { success: false, error: 'Voluntário não encontrado' },
        { status: 404 }
      );
    }

    // Atualiza papel e congregação única do ancião
    const updated = await prisma.$transaction(async (tx) => {
      const u = await tx.user.update({
        where: { id: userId },
        data: {
          globalRole: 'ELDER',
          churchId,
          appointedById: userContext.id,
          status: 'ACTIVE', // Garante que a conta fique ativa para exercer a função
        },
      });

      await tx.auditLog.create({
        data: {
          actorId: userContext.id,
          churchId,
          action: 'ELDER_APPOINTED',
          targetType: 'User',
          targetId: userId,
          result: 'SUCCESS',
          meta: {
            appointedName: targetUser.name,
            appointedEmail: targetUser.email,
            churchName: church.name,
          },
        },
      });

      return u;
    });

    return NextResponse.json({
      success: true,
      message: `${updated.name} agora é Ancião responsável pela congregação ${church.name}.`,
    });
  } catch (error) {
    console.error('Erro ao vincular ancião:', error);
    return NextResponse.json(
      { success: false, error: 'Erro interno ao vincular ancião' },
      { status: 500 }
    );
  }
}
