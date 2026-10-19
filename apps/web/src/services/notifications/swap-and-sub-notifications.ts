import { prisma, createConfirmationTokenWithAudit } from '@revezo/db';
import {
  renderSubstitutionNoticeMessage,
  renderSwapRequestNoticeMessage,
  renderSwapApprovedNoticeMessage,
  renderRegistrationApprovedMessage,
  renderRegistrationRejectedMessage,
  formatScheduleDateTimePtBr,
  wrapEmailHtmlLayout,
} from '@revezo/domain';
import { notificationDispatcher } from './dispatcher';

function getBaseUrl(): string {
  if (process.env.APP_URL) {
    return process.env.APP_URL.replace(/\/$/, '');
  }
  if (process.env.NEXTAUTH_URL) {
    return process.env.NEXTAUTH_URL.replace(/\/$/, '');
  }
  return 'http://localhost:3000';
}

/**
 * Dispara notificação imediata quando um voluntário é escalado automaticamente como substituto
 * (avisa o substituto E os gestores do departamento conforme Regra de Negócio 4).
 */
export async function notifyAutoSubstitution(params: {
  substituteAssignmentId: string;
  originalAssignmentId?: string;
  reason?: string | null;
  actorId?: string;
}): Promise<void> {
  const { substituteAssignmentId, reason, actorId } = params;

  try {
    const assignment = await prisma.assignment.findUnique({
      where: { id: substituteAssignmentId },
      include: {
        user: true,
        slot: {
          include: {
            program: true,
            department: true,
            function: true,
          },
        },
      },
    });

    if (!assignment || assignment.user.status !== 'ACTIVE') {
      return;
    }

    const baseUrl = getBaseUrl();

    // 1. Gera token seguro de confirmação para o substituto
    const tokenRes = await createConfirmationTokenWithAudit({
      assignmentId: assignment.id,
      maxDays: 7,
      actorId: actorId || 'SYSTEM_AUTO_SUB',
      baseUrl,
    });

    const confirmationUrl = `${baseUrl}/confirmar/${tokenRes.rawToken}`;

    // 2. Renderiza mensagem amigável no domínio
    const message = renderSubstitutionNoticeMessage({
      volunteerName: assignment.user.name,
      programTitle: assignment.slot.program.title,
      departmentName: assignment.slot.department.name,
      functionName: assignment.slot.function?.name,
      startsAt: assignment.slot.startsAt,
      endsAt: assignment.slot.endsAt,
      confirmationUrl,
      reason,
    });

    // 3. Despacha respeitando consentimento/opt-out e preferência de canal
    await notificationDispatcher.dispatch({
      recipient: {
        userId: assignment.user.id,
        name: assignment.user.name,
        email: assignment.user.email,
        phonePrimary: assignment.user.phonePrimary,
        preferredChannel: assignment.user.preferredChannel as any,
        optOutWhatsapp: assignment.user.optOutWhatsapp,
        optOutEmail: assignment.user.optOutEmail,
        optOutPush: assignment.user.optOutPush,
        optOutSms: assignment.user.optOutSms,
      },
      message,
      assignmentId: assignment.id,
      kind: 'SUBSTITUTION',
    });

    // 4. Regra 4: Avisa também os gestores do departamento sobre a substituição realizada
    const managers = await prisma.departmentMember.findMany({
      where: {
        departmentId: assignment.slot.departmentId,
        role: 'MANAGER',
        user: { status: 'ACTIVE' },
      },
      include: {
        user: true,
      },
    });

    const { dateStr, timeStr } = formatScheduleDateTimePtBr(
      assignment.slot.startsAt,
      assignment.slot.endsAt
    );
    const roleLabel = assignment.slot.function?.name || assignment.slot.title;
    const scheduleUrl = `${baseUrl}/escalas`;

    for (const mgr of managers) {
      if (mgr.userId === assignment.user.id) continue;
      const mgrFirstName = mgr.user.name.split(' ')[0] || mgr.user.name;
      const subject = `Substituição automática em ${assignment.slot.department.name}: ${assignment.slot.program.title}`;
      const bodyText = [
        `Olá, ${mgrFirstName}!`,
        ``,
        `Houve uma desmarcação no departamento ${assignment.slot.department.name} (${roleLabel}) para o programa "${assignment.slot.program.title}" (${dateStr}, ${timeStr}).`,
        `O sistema escalou automaticamente ${assignment.user.name} como substituto(a) elegível.`,
        reason ? `Motivo informado: ${reason}` : '',
        ``,
        `Acompanhe o painel de escalas: ${scheduleUrl}`,
      ]
        .filter(Boolean)
        .join('\n');

      const bodyHtml = wrapEmailHtmlLayout({
        title: subject,
        previewText: `${assignment.user.name} foi escalado(a) como substituto(a) em ${assignment.slot.department.name}`,
        contentHtml: `
          <h2 style="color: #0F4C5C; font-size: 20px; margin-top: 0; margin-bottom: 16px;">Substituição Automática Realizada</h2>
          <p style="margin: 0 0 12px 0;">Olá, <strong>${mgrFirstName}</strong>!</p>
          <p style="margin: 0 0 12px 0;">Houve uma desmarcação em <strong>${assignment.slot.department.name}</strong> (${roleLabel}) no programa <strong>${assignment.slot.program.title}</strong> (${dateStr}, ${timeStr}).</p>
          <p style="margin: 0 0 12px 0;">O sistema atribuiu automaticamente a vaga para <strong>${assignment.user.name}</strong>.</p>
          ${reason ? `<p style="margin: 0 0 12px 0; color: #475569;"><strong>Motivo informado:</strong> ${reason}</p>` : ''}
          <p style="margin: 20px 0;">
            <a href="${scheduleUrl}" class="btn" style="display: inline-block; padding: 12px 24px; background-color: #0F4C5C; color: #FFFFFF; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 14px;">Ver Escalas</a>
          </p>
        `,
      });

      await notificationDispatcher.dispatch({
        recipient: {
          userId: mgr.user.id,
          name: mgr.user.name,
          email: mgr.user.email,
          phonePrimary: mgr.user.phonePrimary,
          preferredChannel: mgr.user.preferredChannel as any,
          optOutWhatsapp: mgr.user.optOutWhatsapp,
          optOutEmail: mgr.user.optOutEmail,
          optOutPush: mgr.user.optOutPush,
          optOutSms: mgr.user.optOutSms,
        },
        message: {
          subject,
          title: subject,
          bodyText,
          bodyHtml,
          actionUrl: scheduleUrl,
          actionText: 'Ver Escalas',
        },
        assignmentId: assignment.id,
        kind: 'SUBSTITUTION',
      });
    }
  } catch (err: unknown) {
    console.error('Erro ao despachar notificação de substituição automática:', err);
  }
}

/**
 * Alerta os gestores do departamento quando uma desmarcação deixa o slot ABERTO (sem substituto elegível).
 */
export async function notifyManagerOpenSlot(params: {
  assignmentId: string;
  reason?: string | null;
  diagnosis?: string;
}): Promise<void> {
  const { assignmentId, reason, diagnosis } = params;

  try {
    const assignment = await prisma.assignment.findUnique({
      where: { id: assignmentId },
      include: {
        user: true,
        slot: {
          include: {
            program: true,
            department: true,
            function: true,
          },
        },
      },
    });

    if (!assignment) return;

    const managers = await prisma.departmentMember.findMany({
      where: {
        departmentId: assignment.slot.departmentId,
        role: 'MANAGER',
        user: { status: 'ACTIVE' },
      },
      include: {
        user: true,
      },
    });

    if (managers.length === 0) return;

    const baseUrl = getBaseUrl();
    const openSlotsUrl = `${baseUrl}/slots-abertos`;
    const { dateStr, timeStr } = formatScheduleDateTimePtBr(
      assignment.slot.startsAt,
      assignment.slot.endsAt
    );
    const roleLabel = assignment.slot.function?.name || assignment.slot.title;

    for (const mgr of managers) {
      const mgrFirstName = mgr.user.name.split(' ')[0] || mgr.user.name;
      const subject = `Atenção: vaga em aberto em ${assignment.slot.department.name} (${assignment.slot.program.title})`;
      const bodyText = [
        `Olá, ${mgrFirstName}!`,
        ``,
        `${assignment.user.name} informou que não poderá comparecer em ${assignment.slot.department.name} (${roleLabel}) no programa "${assignment.slot.program.title}" (${dateStr}, ${timeStr}).`,
        `Nenhum substituto automático elegível foi encontrado e a vaga ficou em aberto.`,
        reason ? `Motivo informado: ${reason}` : '',
        diagnosis ? `Diagnóstico: ${diagnosis}` : '',
        ``,
        `Acesse as vagas em aberto para atribuir outro voluntário: ${openSlotsUrl}`,
      ]
        .filter(Boolean)
        .join('\n');

      const bodyHtml = wrapEmailHtmlLayout({
        title: subject,
        previewText: `Vaga em aberto em ${assignment.slot.department.name} após desmarcação`,
        contentHtml: `
          <h2 style="color: #B45309; font-size: 20px; margin-top: 0; margin-bottom: 16px;">Atenção: Vaga em Aberto</h2>
          <p style="margin: 0 0 12px 0;">Olá, <strong>${mgrFirstName}</strong>!</p>
          <p style="margin: 0 0 12px 0;"><strong>${assignment.user.name}</strong> desmarcou sua participação em <strong>${assignment.slot.department.name}</strong> (${roleLabel}) no programa <strong>${assignment.slot.program.title}</strong> (${dateStr}, ${timeStr}).</p>
          <p style="margin: 0 0 12px 0;">Nenhum substituto elegível foi encontrado automaticamente e o slot ficou <strong>ABERTO</strong>.</p>
          ${reason ? `<p style="margin: 0 0 8px 0; color: #475569;"><strong>Motivo informado:</strong> ${reason}</p>` : ''}
          ${diagnosis ? `<p style="margin: 0 0 12px 0; color: #475569;"><strong>Diagnóstico:</strong> ${diagnosis}</p>` : ''}
          <p style="margin: 20px 0;">
            <a href="${openSlotsUrl}" class="btn" style="display: inline-block; padding: 12px 24px; background-color: #B45309; color: #FFFFFF; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 14px;">Resolver Vaga em Aberto</a>
          </p>
        `,
      });

      await notificationDispatcher.dispatch({
        recipient: {
          userId: mgr.user.id,
          name: mgr.user.name,
          email: mgr.user.email,
          phonePrimary: mgr.user.phonePrimary,
          preferredChannel: mgr.user.preferredChannel as any,
          optOutWhatsapp: mgr.user.optOutWhatsapp,
          optOutEmail: mgr.user.optOutEmail,
          optOutPush: mgr.user.optOutPush,
          optOutSms: mgr.user.optOutSms,
        },
        message: {
          subject,
          title: subject,
          bodyText,
          bodyHtml,
          actionUrl: openSlotsUrl,
          actionText: 'Resolver Vaga em Aberto',
        },
        assignmentId: assignment.id,
        kind: 'SUBSTITUTION',
      });
    }
  } catch (err: unknown) {
    console.error('Erro ao notificar gestores sobre slot aberto:', err);
  }
}

/**
 * Notifica o voluntário-alvo de um pedido direto de troca de escala.
 */
export async function notifySwapRequested(params: {
  swapRequestId: string;
}): Promise<void> {
  const { swapRequestId } = params;

  try {
    const swap = await prisma.swapRequest.findUnique({
      where: { id: swapRequestId },
      include: {
        requester: true,
        targetUser: true,
        assignment: {
          include: {
            slot: {
              include: {
                program: true,
                department: true,
                function: true,
              },
            },
          },
        },
      },
    });

    if (!swap || !swap.targetUser || swap.targetUser.status !== 'ACTIVE') {
      return;
    }

    const baseUrl = getBaseUrl();
    const swapsUrl = `${baseUrl}/trocas`;

    const message = renderSwapRequestNoticeMessage({
      targetVolunteerName: swap.targetUser.name,
      requesterName: swap.requester.name,
      programTitle: swap.assignment.slot.program.title,
      departmentName: swap.assignment.slot.department.name,
      functionName: swap.assignment.slot.function?.name,
      startsAt: swap.assignment.slot.startsAt,
      endsAt: swap.assignment.slot.endsAt,
      swapsUrl,
      reason: swap.reason,
    });

    await notificationDispatcher.dispatch({
      recipient: {
        userId: swap.targetUser.id,
        name: swap.targetUser.name,
        email: swap.targetUser.email,
        phonePrimary: swap.targetUser.phonePrimary,
        preferredChannel: swap.targetUser.preferredChannel as any,
        optOutWhatsapp: swap.targetUser.optOutWhatsapp,
        optOutEmail: swap.targetUser.optOutEmail,
        optOutPush: swap.targetUser.optOutPush,
        optOutSms: swap.targetUser.optOutSms,
      },
      message,
      assignmentId: swap.assignmentId,
      kind: 'D1',
    });
  } catch (err: unknown) {
    console.error('Erro ao notificar solicitação de troca:', err);
  }
}

/**
 * Notifica os voluntários envolvidos quando a troca for aprovada pela liderança.
 */
export async function notifySwapApproved(params: {
  swapRequestId: string;
}): Promise<void> {
  const { swapRequestId } = params;

  try {
    const swap = await prisma.swapRequest.findUnique({
      where: { id: swapRequestId },
      include: {
        requester: true,
        targetUser: true,
        assignment: {
          include: {
            slot: {
              include: {
                program: true,
                department: true,
                function: true,
              },
            },
          },
        },
      },
    });

    if (!swap || !swap.targetUser) {
      return;
    }

    const baseUrl = getBaseUrl();
    const scheduleUrl = `${baseUrl}/minha-escala`;

    // 1. Notifica o voluntário que assumiu a escala (targetUser)
    const targetMsg = renderSwapApprovedNoticeMessage({
      volunteerName: swap.targetUser.name,
      partnerName: swap.requester.name,
      programTitle: swap.assignment.slot.program.title,
      departmentName: swap.assignment.slot.department.name,
      functionName: swap.assignment.slot.function?.name,
      startsAt: swap.assignment.slot.startsAt,
      endsAt: swap.assignment.slot.endsAt,
      scheduleUrl,
    });

    await notificationDispatcher.dispatch({
      recipient: {
        userId: swap.targetUser.id,
        name: swap.targetUser.name,
        email: swap.targetUser.email,
        phonePrimary: swap.targetUser.phonePrimary,
        preferredChannel: swap.targetUser.preferredChannel as any,
        optOutWhatsapp: swap.targetUser.optOutWhatsapp,
        optOutEmail: swap.targetUser.optOutEmail,
        optOutPush: swap.targetUser.optOutPush,
        optOutSms: swap.targetUser.optOutSms,
      },
      message: targetMsg,
      assignmentId: swap.assignmentId,
      kind: 'D1',
    });

    // 2. Notifica o voluntário que pediu a troca (requester) confirmando a liberação
    const requesterMsg = renderSwapApprovedNoticeMessage({
      volunteerName: swap.requester.name,
      partnerName: swap.targetUser.name,
      programTitle: swap.assignment.slot.program.title,
      departmentName: swap.assignment.slot.department.name,
      functionName: swap.assignment.slot.function?.name,
      startsAt: swap.assignment.slot.startsAt,
      endsAt: swap.assignment.slot.endsAt,
      scheduleUrl,
    });

    await notificationDispatcher.dispatch({
      recipient: {
        userId: swap.requester.id,
        name: swap.requester.name,
        email: swap.requester.email,
        phonePrimary: swap.requester.phonePrimary,
        preferredChannel: swap.requester.preferredChannel as any,
        optOutWhatsapp: swap.requester.optOutWhatsapp,
        optOutEmail: swap.requester.optOutEmail,
        optOutPush: swap.requester.optOutPush,
        optOutSms: swap.requester.optOutSms,
      },
      message: requesterMsg,
      assignmentId: swap.assignmentId,
      kind: 'D1',
    });
  } catch (err: unknown) {
    console.error('Erro ao notificar aprovação de troca:', err);
  }
}

/**
 * Notifica o novo voluntário de que seu autocadastro foi aprovado pela liderança.
 */
export async function notifyRegistrationApproved(params: {
  userId: string;
  departmentId: string;
  churchId?: string | null;
}): Promise<void> {
  const { userId, departmentId, churchId } = params;

  try {
    const [user, dept, church] = await Promise.all([
      prisma.user.findUnique({ where: { id: userId } }),
      prisma.department.findUnique({ where: { id: departmentId } }),
      churchId
        ? prisma.church.findUnique({ where: { id: churchId } })
        : prisma.church.findFirst({ where: { active: true }, orderBy: { createdAt: 'asc' } }),
    ]);

    if (!user) return;

    const baseUrl = getBaseUrl();
    const loginUrl = `${baseUrl}/login`;
    const churchName = church?.name || 'sua igreja';
    const departmentName = dept?.name || 'sua equipe';

    const message = renderRegistrationApprovedMessage({
      volunteerName: user.name,
      departmentName,
      churchName,
      loginUrl,
    });

    await notificationDispatcher.dispatch({
      recipient: {
        userId: user.id,
        name: user.name,
        email: user.email,
        phonePrimary: user.phonePrimary,
        preferredChannel: user.preferredChannel as any,
        optOutWhatsapp: user.optOutWhatsapp,
        optOutEmail: user.optOutEmail,
        optOutPush: user.optOutPush,
        optOutSms: user.optOutSms,
      },
      message,
    });
  } catch (err: unknown) {
    console.error('Erro ao despachar notificação de aprovação de cadastro:', err);
  }
}

/**
 * Notifica o usuário de que sua solicitação de cadastro foi recusada pela liderança.
 */
export async function notifyRegistrationRejected(params: {
  userId: string;
  reason?: string | null;
  churchId?: string | null;
}): Promise<void> {
  const { userId, reason, churchId } = params;

  try {
    const [user, church] = await Promise.all([
      prisma.user.findUnique({ where: { id: userId } }),
      churchId
        ? prisma.church.findUnique({ where: { id: churchId } })
        : prisma.church.findFirst({ where: { active: true }, orderBy: { createdAt: 'asc' } }),
    ]);

    if (!user) return;

    const churchName = church?.name || 'sua igreja';

    const message = renderRegistrationRejectedMessage({
      volunteerName: user.name,
      churchName,
      reason,
    });

    await notificationDispatcher.dispatch({
      recipient: {
        userId: user.id,
        name: user.name,
        email: user.email,
        phonePrimary: user.phonePrimary,
        preferredChannel: user.preferredChannel as any,
        optOutWhatsapp: user.optOutWhatsapp,
        optOutEmail: user.optOutEmail,
        optOutPush: user.optOutPush,
        optOutSms: user.optOutSms,
      },
      message,
    });
  } catch (err: unknown) {
    console.error('Erro ao despachar notificação de recusa de cadastro:', err);
  }
}

