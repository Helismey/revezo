import React from 'react';
import { prisma } from '@revezo/db';
import { getSession, getCurrentUserContext } from '@/lib/auth-service';
import { redirect } from 'next/navigation';
import { can, maskPhoneNumber, maskEmail } from '@revezo/domain';
import { CanaisClient } from './CanaisClient';

export default async function CanaisPage() {
  const session = await getSession();
  if (!session) {
    redirect('/login');
  }

  const userContext = await getCurrentUserContext();
  const allowed = can(userContext, 'system:technical:manage');

  if (!allowed) {
    redirect('/');
  }

  // 1. Busca feature flags, histórico recente de notificações e voluntários ativos em paralelo
  const [flags, recentLogs, activeUsers] = await Promise.all([
    prisma.featureFlag.findMany(),
    prisma.notificationLog.findMany({
      orderBy: { sentAt: 'desc' },
      take: 20,
      include: {
        assignment: {
          include: {
            user: {
              select: { name: true, phonePrimary: true, email: true },
            },
            slot: {
              select: { title: true, department: { select: { name: true } } },
            },
          },
        },
      },
    }),
    prisma.user.findMany({
      where: { status: 'ACTIVE' },
      select: { id: true, name: true, email: true, phonePrimary: true },
      orderBy: { name: 'asc' },
    }),
  ]);

  const flagMap: Record<string, boolean> = {};
  for (const f of flags) {
    flagMap[f.key] = f.enabled;
  }

  const serializedLogs = recentLogs.map((l) => ({
    id: l.id,
    kind: l.kind,
    channel: l.channel,
    success: l.success,
    error: l.error,
    sentAt: l.sentAt.toISOString(),
    recipientName: l.assignment?.user.name || 'Destinatário',
    recipientContact: l.channel === 'WHATSAPP' || l.channel === 'SMS'
      ? maskPhoneNumber(l.assignment?.user.phonePrimary)
      : maskEmail(l.assignment?.user.email),
    slotDescription: l.assignment
      ? `${l.assignment.slot.department.name} (${l.assignment.slot.title})`
      : 'Disparo direto',
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display font-bold text-2xl sm:text-3xl text-ink">
          Canais de Envio e Notificações
        </h1>
        <p className="text-sm text-ink-muted mt-1">
          Gerencie o envio de mensagens (WhatsApp, E-mail, Web Push e SMS), controle feature flags e acompanhe a entrega.
        </p>
      </div>

      <CanaisClient
        initialFlags={flagMap}
        recentLogs={serializedLogs}
        activeUsers={activeUsers}
      />
    </div>
  );
}
