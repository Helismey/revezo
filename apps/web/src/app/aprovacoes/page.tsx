import React from 'react';
import { prisma } from '@revezo/db';
import { getSession, getCurrentUserContext, getActiveChurchContext } from '@/lib/auth-service';
import { redirect } from 'next/navigation';
import {
  AprovacoesClient,
  PendingUser,
  DepartmentWithFunctions,
  PendingScheduleAssignment,
  ActiveVolunteerOption,
} from './AprovacoesClient';
import { can, maskEmail, maskPhoneNumber } from '@revezo/domain';

export default async function AprovacoesPage() {
  const session = await getSession();
  if (!session) {
    redirect('/login');
  }

  const userContext = await getCurrentUserContext();
  const churchContext = await getActiveChurchContext();
  const activeChurchId = churchContext.church?.id;

  const isMasterOrElder =
    userContext?.globalRole === 'ADMIN_MASTER' ||
    userContext?.globalRole === 'PASTOR' ||
    userContext?.globalRole === 'ELDER';

  const managedDeptIds =
    userContext?.departmentMemberships
      .filter((m) => m.role === 'MANAGER')
      .map((m) => m.departmentId) || [];

  const canApproveRegistrations = can(userContext, 'registration:approve', {
    churchId: activeChurchId,
    departmentIds: managedDeptIds,
  });
  const canApproveSchedules =
    isMasterOrElder ||
    userContext?.departmentMemberships.some((m) => m.role === 'MANAGER');

  if (!canApproveRegistrations && !canApproveSchedules) {
    redirect('/');
  }

  // 1. Novos voluntários pendentes de aprovação
  const pendingWhere =
    userContext?.globalRole === 'ADMIN_MASTER'
      ? { status: 'PENDING' as const }
      : activeChurchId
      ? { status: 'PENDING' as const, churchId: activeChurchId }
      : { status: 'PENDING' as const };

  const pending = canApproveRegistrations
    ? await prisma.user.findMany({
        where: pendingWhere,
        orderBy: { createdAt: 'asc' },
      })
    : [];

  // 2. Departamentos e Funções
  const deptWhere = isMasterOrElder
    ? (activeChurchId ? { OR: [{ churchId: activeChurchId }, { churchId: null }] } : undefined)
    : { id: { in: managedDeptIds } };

  const departments = await prisma.department.findMany({
    where: deptWhere,
    include: { functions: true },
    orderBy: { name: 'asc' },
  });

  // 3. Escalas preliminares pendentes de aprovação (geradas por Pastor / Ancião)
  const pendingAssignments = await prisma.assignment.findMany({
    where: {
      status: 'PENDING_APPROVAL',
      ...(!isMasterOrElder ? { slot: { departmentId: { in: managedDeptIds } } } : {}),
      ...(activeChurchId ? { slot: { department: { churchId: activeChurchId } } } : {}),
    },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          phonePrimary: true,
        },
      },
      slot: {
        include: {
          program: {
            select: {
              id: true,
              title: true,
              date: true,
            },
          },
          department: {
            select: {
              id: true,
              name: true,
            },
          },
          function: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      },
    },
    orderBy: {
      slot: { startsAt: 'asc' },
    },
  });

  // 4. Voluntários ativos para caso o líder queira ajustar a atribuição
  const activeVolunteers = await prisma.user.findMany({
    where: {
      status: 'ACTIVE',
      ...(activeChurchId ? { churchId: activeChurchId } : {}),
    },
    select: {
      id: true,
      name: true,
      memberships: {
        select: { departmentId: true },
      },
    },
    orderBy: { name: 'asc' },
  });

  const serializedPending: PendingUser[] = pending.map((u) => ({
    id: u.id,
    name: u.name,
    email: isMasterOrElder ? u.email : maskEmail(u.email),
    phonePrimary:
      isMasterOrElder ? u.phonePrimary : u.phonePrimary ? maskPhoneNumber(u.phonePrimary) : null,
    whatsapp:
      isMasterOrElder ? u.whatsapp : u.whatsapp ? maskPhoneNumber(u.whatsapp) : null,
    birthDate: isMasterOrElder && u.birthDate ? u.birthDate.toISOString() : null,
    createdAt: u.createdAt.toISOString(),
  }));

  const serializedDepartments: DepartmentWithFunctions[] = departments.map((d) => ({
    id: d.id,
    name: d.name,
    functions: d.functions.map((f) => ({ id: f.id, name: f.name })),
  }));

  const serializedPendingSchedules: PendingScheduleAssignment[] = pendingAssignments.map((a) => ({
    id: a.id,
    status: a.status,
    createdAt: a.createdAt.toISOString(),
    userId: a.userId,
    userName: a.user.name,
    userEmail: a.user.email,
    userPhone: a.user.phonePrimary,
    slotId: a.slot.id,
    slotTitle: a.slot.title,
    startsAt: a.slot.startsAt.toISOString(),
    endsAt: a.slot.endsAt.toISOString(),
    departmentId: a.slot.department.id,
    departmentName: a.slot.department.name,
    functionId: a.slot.function?.id || null,
    functionName: a.slot.function?.name || null,
    programId: a.slot.program.id,
    programTitle: a.slot.program.title,
    programDate: a.slot.program.date.toISOString(),
  }));

  const serializedActiveVolunteers: ActiveVolunteerOption[] = activeVolunteers.map((v) => ({
    id: v.id,
    name: v.name,
    departmentIds: v.memberships.map((m) => m.departmentId),
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display font-bold text-2xl sm:text-3xl text-foreground">Central de Aprovações</h1>
        <p className="text-sm text-foreground-muted mt-1">
          Gerencie solicitações de novos cadastros e aprove ou ajuste escalas preliminares geradas pela liderança para seus departamentos.
        </p>
      </div>

      <AprovacoesClient
        pendingUsers={serializedPending}
        departments={serializedDepartments}
        pendingSchedules={serializedPendingSchedules}
        activeVolunteers={serializedActiveVolunteers}
        initialTab={serializedPendingSchedules.length > 0 && serializedPending.length === 0 ? 'schedules' : 'users'}
      />
    </div>
  );
}
