import React from 'react';
import { prisma } from '@revezo/db';
import { detectVolunteerOverload } from '@revezo/domain';
import { getSession, getCurrentUserContext, getActiveChurchContext } from '@/lib/auth-service';
import { redirect } from 'next/navigation';
import { EscalasClient, SerializedProgram, AvailableVolunteer } from './EscalasClient';

export default async function EscalasPage() {
  const session = await getSession();
  if (!session) {
    redirect('/login');
  }

  const userContext = await getCurrentUserContext();
  const { activeChurch } = await getActiveChurchContext();

  const isAdmin = userContext?.globalRole === 'ADMIN_MASTER';
  const isPastor = userContext?.globalRole === 'PASTOR';
  const isElder = userContext?.globalRole === 'ELDER';
  const isManager = userContext?.departmentMemberships.some((m) => m.role === 'MANAGER');
  const isAuthorized = Boolean(isAdmin || isPastor || isElder || isManager);

  // Busca todos os programas futuros com seus slots e escalas da congregação ativa
  const programs = await prisma.program.findMany({
    where: {
      ...(activeChurch ? { churchId: activeChurch.id } : {}),
    },
    include: {
      slots: {
        include: {
          department: true,
          function: true,
          assignments: {
            where: {
              status: { notIn: ['DECLINED', 'SUBSTITUTED'] },
            },
            include: {
              user: {
                select: { id: true, name: true },
              },
            },
          },
        },
        orderBy: {
          startsAt: 'asc',
        },
      },
    },
    orderBy: {
      date: 'asc',
    },
  });

  // Busca voluntários ativos da congregação com suas disponibilidades e escalas ativas
  const activeUsers = await prisma.user.findMany({
    where: {
      status: 'ACTIVE',
      ...(activeChurch ? { churchId: activeChurch.id } : {}),
    },
    include: {
      memberships: {
        include: {
          functions: true,
        },
      },
      availabilities: true,
      assignments: {
        where: {
          status: { in: ['CONFIRMED', 'PENDING'] },
        },
        include: {
          slot: {
            select: { startsAt: true, endsAt: true },
          },
        },
      },
    },
  });

  const serializedPrograms: SerializedProgram[] = programs.map((p) => ({
    id: p.id,
    title: p.title,
    date: p.date.toISOString(),
    slots: p.slots.map((s) => ({
      id: s.id,
      title: s.title,
      departmentId: s.departmentId,
      departmentName: s.department.name,
      functionId: s.functionId,
      functionName: s.function?.name,
      startsAt: s.startsAt.toISOString(),
      endsAt: s.endsAt.toISOString(),
      requiredCount: s.requiredCount,
      assignments: s.assignments.map((a) => ({
        id: a.id,
        userId: a.userId,
        userName: a.user.name,
        status: a.status,
      })),
    })),
  }));

  const serializedVolunteers: AvailableVolunteer[] = activeUsers.map((u) => {
    const overload = detectVolunteerOverload(
      u.assignments.map((a) => ({
        id: a.id,
        startsAt: a.slot.startsAt,
        endsAt: a.slot.endsAt,
        status: a.status,
      }))
    );

    return {
      id: u.id,
      name: u.name,
      departmentIds: u.memberships.map((m) => m.departmentId),
      functionIds: u.memberships.flatMap((m) => m.functions.map((f) => f.functionId)),
      availabilities: u.availabilities.map((av) => ({
        kind: av.kind,
        weekday: av.weekday,
        from: av.from?.toISOString() || null,
        to: av.to?.toISOString() || null,
      })),
      isOverloaded: overload.isOverloaded,
      consecutiveWeekendsCount: overload.consecutiveWeekends,
      assignmentsIn30Days: overload.assignmentsIn30Days,
    };
  });

  const managedDeptIds = (userContext?.departmentMemberships ?? [])
    .filter((m) => m.role === 'MANAGER')
    .map((m) => m.departmentId);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display font-bold text-2xl sm:text-3xl text-ink">Montagem de Escalas</h1>
          <p className="text-sm text-ink-muted mt-1">
            Atribua os voluntários respeitando o limite de 2 por dia e sem conflitos de horário.
          </p>
        </div>
      </div>

      {serializedPrograms.length === 0 ? (
        <div className="bg-surface rounded-surface border border-line p-8 text-center">
          <p className="text-ink-muted text-sm">
            Nenhum programa ainda. Crie o primeiro para montar a escala.
          </p>
        </div>
      ) : (
        <EscalasClient
          programs={serializedPrograms}
          volunteers={serializedVolunteers}
          isManagerOrAdmin={isAuthorized}
          canManageAll={Boolean(isAdmin || isPastor || isElder)}
          managedDepartmentIds={managedDeptIds}
        />
      )}
    </div>
  );
}
