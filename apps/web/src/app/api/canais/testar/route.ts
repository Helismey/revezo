import { NextResponse } from 'next/server';
import { sendTestNotificationSchema } from '@revezo/contracts';
import { prisma } from '@revezo/db';
import { getSession, getCurrentUserContext } from '@/lib/auth-service';
import { can, renderReminderMessage } from '@revezo/domain';
import { notificationDispatcher } from '@/services/notifications/dispatcher';

export async function POST(request: Request) {
  try {
    const session = await getSession();
    const userContext = await getCurrentUserContext();

    if (!session || !userContext) {
      return NextResponse.json({ success: false, error: 'Não autorizado' }, { status: 401 });
    }

    const allowed = can(userContext, 'system:technical:manage');
    if (!allowed) {
      return NextResponse.json({ success: false, error: 'Apenas administradores técnicos podem testar canais' }, { status: 403 });
    }

    const body = await request.json();
    const parsed = sendTestNotificationSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0]?.message || 'Dados inválidos' },
        { status: 400 }
      );
    }

    const targetUser = await prisma.user.findUnique({
      where: { id: parsed.data.targetUserId },
    });

    if (!targetUser) {
      return NextResponse.json({ success: false, error: 'Usuário não encontrado' }, { status: 404 });
    }

    const testMessage = renderReminderMessage({
      volunteerName: targetUser.name,
      programTitle: 'Culto de Teste',
      departmentName: 'Equipe de Comunicação',
      functionName: 'Disparo de Teste',
      startsAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      endsAt: new Date(Date.now() + 26 * 60 * 60 * 1000),
      confirmationUrl: 'https://escala.igreja.local/minha-escala',
      kind: 'D1',
      isAlreadyConfirmed: false,
    });

    const result = await notificationDispatcher.dispatch({
      recipient: {
        userId: targetUser.id,
        name: targetUser.name,
        email: targetUser.email,
        phonePrimary: targetUser.phonePrimary,
        whatsapp: targetUser.whatsapp,
        preferredChannel: targetUser.preferredChannel as any,
        optOutWhatsapp: targetUser.optOutWhatsapp,
        optOutEmail: targetUser.optOutEmail,
        optOutPush: targetUser.optOutPush,
        optOutSms: targetUser.optOutSms,
      },
      message: testMessage,
      forcedChannel: parsed.data.channel.toLowerCase() as any,
    });

    return NextResponse.json({
      success: result.success,
      channel: result.channel,
      error: result.error,
      externalMessageId: result.externalMessageId,
    });
  } catch (err: unknown) {
    console.error('Erro ao testar envio de notificação:', err);
    return NextResponse.json(
      { success: false, error: 'Erro ao disparar teste de notificação' },
      { status: 500 }
    );
  }
}
