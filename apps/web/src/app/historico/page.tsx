import React from 'react';
import { getSession, getCurrentUserContext, getActiveChurchContext } from '@/lib/auth-service';
import { redirect } from 'next/navigation';
import { prisma, getDepartmentParticipationReport, getScheduleHistory } from '@revezo/db';
import HistoricoClient from './HistoricoClient';

export default async function HistoricoPage() {
  const session = await getSession();
  const userContext = await getCurrentUserContext();
  const { activeChurch } = await getActiveChurchContext();

  if (!session || !userContext) {
    redirect('/login');
  }

  const isAdmin = userContext.globalRole === 'ADMIN_MASTER';
  const isPastor = userContext.globalRole === 'PASTOR';
  const isElder = userContext.globalRole === 'ELDER';
  const managedDeptIds = userContext.departmentMemberships
    .filter((m) => m.role === 'MANAGER')
    .map((m) => m.departmentId);

  if (!isAdmin && !isPastor && !isElder && managedDeptIds.length === 0) {
    redirect('/');
  }

  // Se for admin, pastor ou ancião, tem acesso a todos os departamentos da congregação ativa
  const canViewAllInChurch = isAdmin || isPastor || isElder;

  const departments = await prisma.department.findMany({
    where: {
      ...(canViewAllInChurch ? {} : { id: { in: managedDeptIds } }),
      ...(activeChurch ? { churchId: activeChurch.id } : {}),
    },
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
  });

  const defaultDeptId = departments[0]?.id;

  const [initialReport, rawScheduleHistory] = await Promise.all([
    getDepartmentParticipationReport({
      departmentId: defaultDeptId,
      churchId: activeChurch?.id,
    }),
    getScheduleHistory({
      departmentId: defaultDeptId,
      churchId: activeChurch?.id,
      page: 1,
      limit: 50,
    }),
  ]);

  const serializedHistory = {
    ...rawScheduleHistory,
    events: rawScheduleHistory.events.map((ev) => ({
      ...ev,
      timestamp: ev.timestamp.toISOString(),
      slot: {
        ...ev.slot,
        startsAt: ev.slot.startsAt.toISOString(),
        endsAt: ev.slot.endsAt.toISOString(),
      },
    })),
  };

  return (
    <HistoricoClient
      isAdmin={canViewAllInChurch}
      departments={departments}
      initialReport={initialReport}
      initialHistory={serializedHistory}
      initialDepartmentId={defaultDeptId || ''}
    />
  );
}
