import { NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';
import { prisma, createConfirmationTokenWithAudit } from '@revezo/db';
import {
  identifyPendingReminders,
  renderReminderMessage,
  AssignmentForReminder,
  ExistingNotificationLog,
} from '@revezo/domain';
import { notificationDispatcher } from '@/services/notifications/dispatcher';

async function handleReminders(request: Request) {
  try {
    // 1. Validação de segurança via CRON_SECRET com proteção contra timing attack e fail-closed
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET?.trim();

    if (process.env.NODE_ENV === 'production') {
      if (!cronSecret) {
        return NextResponse.json(
          { success: false, error: 'CRON_SECRET não configurado no servidor em produção.' },
          { status: 500 }
        );
      }
      const expectedToken = `Bearer ${cronSecret}`;
      const provided = authHeader || '';
      const bufA = Buffer.from(provided);
      const bufB = Buffer.from(expectedToken);
      const isValid = bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
      if (!isValid) {
        return NextResponse.json({ success: false, error: 'Acesso não autorizado' }, { status: 401 });
      }
    } else if (cronSecret && authHeader) {
      const expectedToken = `Bearer ${cronSecret}`;
      const bufA = Buffer.from(authHeader);
      const bufB = Buffer.from(expectedToken);
      const isValid = bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
      if (!isValid) {
        return NextResponse.json({ success: false, error: 'Acesso não autorizado' }, { status: 401 });
      }
    }

    const host = request.headers.get('host') || 'localhost:3000';
    const protocol = host.includes('localhost') ? 'http' : 'https';
    const baseUrl = `${protocol}://${host}`;

    const now = new Date();
    // Janela de até 9 dias à frente para cobrir D-7 com folga
    const nineDaysAhead = new Date(now.getTime() + 9 * 24 * 60 * 60 * 1000);

    // 2. Busca escalas futuras que possam se enquadrar nas janelas de lembrete
    const assignments = await prisma.assignment.findMany({
      where: {
        status: { in: ['PENDING', 'CONFIRMED'] },
        slot: {
          startsAt: {
            gte: now,
            lte: nineDaysAhead,
          },
        },
      },
      include: {
        user: true,
        slot: {
          include: {
            program: true,
            department: true,
            function: true,
          },
        },
        logs: true,
      },
    });

    // 3. Monta listas para o motor puro de cálculo de lembretes
    const domainAssignments: AssignmentForReminder[] = assignments.map((a) => ({
      id: a.id,
      userId: a.userId,
      userName: a.user.name,
      userEmail: a.user.email,
      userPhonePrimary: a.user.phonePrimary,
      preferredChannel: a.user.preferredChannel as any,
      optOutWhatsapp: a.user.optOutWhatsapp,
      optOutEmail: a.user.optOutEmail,
      optOutPush: a.user.optOutPush,
      optOutSms: a.user.optOutSms,
      startsAt: a.slot.startsAt,
      endsAt: a.slot.endsAt,
      status: a.status as any,
      programTitle: a.slot.program.title,
      departmentName: a.slot.department.name,
      functionName: a.slot.function?.name,
    }));

    const allSentLogs: ExistingNotificationLog[] = assignments.flatMap((a) =>
      a.logs.map((l) => ({
        assignmentId: a.id,
        kind: l.kind as any,
        success: l.success,
      }))
    );

    const pendingReminders = identifyPendingReminders(domainAssignments, allSentLogs, now);

    let successCount = 0;
    let failureCount = 0;
    const results: { assignmentId: string; kind: string; success: boolean; channel?: string; error?: string }[] = [];

    // 4. Executa os disparos pendentes
    for (const item of pendingReminders) {
      try {
        // Gera token de confirmação seguro
        const tokenRes = await createConfirmationTokenWithAudit({
          assignmentId: item.assignment.id,
          maxDays: 7,
          actorId: 'SYSTEM_CRON',
        });

        const confirmationUrl = `${baseUrl}/confirmar/${tokenRes.rawToken}`;

        const message = renderReminderMessage({
          volunteerName: item.assignment.userName,
          programTitle: item.assignment.programTitle,
          departmentName: item.assignment.departmentName,
          functionName: item.assignment.functionName,
          startsAt: item.assignment.startsAt,
          endsAt: item.assignment.endsAt,
          confirmationUrl,
          kind: item.kind,
          isAlreadyConfirmed: item.assignment.status === 'CONFIRMED',
        });

        const dispatchResult = await notificationDispatcher.dispatch({
          recipient: {
            userId: item.assignment.userId,
            name: item.assignment.userName,
            email: item.assignment.userEmail,
            phonePrimary: item.assignment.userPhonePrimary,
            preferredChannel: item.assignment.preferredChannel,
            optOutWhatsapp: item.assignment.optOutWhatsapp,
            optOutEmail: item.assignment.optOutEmail,
            optOutPush: item.assignment.optOutPush,
            optOutSms: item.assignment.optOutSms,
          },
          message,
          assignmentId: item.assignment.id,
          kind: item.kind,
        });

        if (dispatchResult.success) {
          successCount++;
        } else {
          failureCount++;
        }

        results.push({
          assignmentId: item.assignment.id,
          kind: item.kind,
          success: dispatchResult.success,
          channel: dispatchResult.channel,
          error: dispatchResult.error,
        });
      } catch (err: unknown) {
        failureCount++;
        results.push({
          assignmentId: item.assignment.id,
          kind: item.kind,
          success: false,
          error: err instanceof Error ? err.message : 'Erro ao processar envio',
        });
      }
    }

    return NextResponse.json({
      success: true,
      processed: pendingReminders.length,
      successCount,
      failureCount,
      results,
    });
  } catch (err: unknown) {
    console.error('Erro na rota de cron de lembretes:', err);
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : 'Erro interno ao disparar lembretes' },
      { status: 500 }
    );
  }
}

export async function GET(request: Request) {
  return handleReminders(request);
}

export async function POST(request: Request) {
  return handleReminders(request);
}

