import React from 'react';
import { prisma } from '@revezo/db';
import { getSession, getCurrentUserContext, getActiveChurchContext } from '@/lib/auth-service';
import { redirect } from 'next/navigation';
import { ProgramasClient, ProgramListItem, DepartmentOption } from './ProgramasClient';
import { can, ROLE_HIERARCHY_LEVEL } from '@revezo/domain';

export default async function ProgramasPage() {
  const session = await getSession();
  if (!session) {
    redirect('/login');
  }

  const userContext = await getCurrentUserContext();
  const churchContext = await getActiveChurchContext();
  const activeChurchId = churchContext.church?.id;

  const canManage = can(userContext, 'program:create', {
    churchId: activeChurchId,
  });

  // Filtro por congregação ativa
  const churchFilter = activeChurchId
    ? { OR: [{ churchId: activeChurchId }, { churchId: null }] }
    : {};

  // Busca programas da congregação ativa ordenados por data
  const programs = await prisma.program.findMany({
    where: churchFilter,
    include: {
      departments: {
        include: { department: true },
      },
      // ⚡ Bolt Optimization: Use Prisma's _count to offload aggregation to the DB
      // instead of fetching full relation arrays just to count the length in JS.
      _count: {
        select: { slots: true }
      }
    },
    orderBy: {
      date: 'asc',
    },
  });

  // Busca departamentos da congregação ativa
  const departments = await prisma.department.findMany({
    where: churchFilter,
    include: {
      functions: true,
    },
    orderBy: {
      name: 'asc',
    },
  });

  const userHierarchy = userContext ? ROLE_HIERARCHY_LEVEL[userContext.globalRole] : 1;

  const serializedPrograms: ProgramListItem[] = programs.map((p) => {
    const creatorHierarchy = p.createdByRole ? ROLE_HIERARCHY_LEVEL[p.createdByRole] : 1;
    const isCreatedBySuperior = creatorHierarchy > userHierarchy;

    return {
      id: p.id,
      title: p.title,
      date: p.date.toISOString(),
      departments: p.departments.map((d) => ({
        id: d.department.id,
        name: d.department.name,
      })),
      slotsCount: p._count.slots,
      createdByRole: p.createdByRole,
      isCreatedBySuperior,
    };
  });

  const departmentOptions: DepartmentOption[] = departments.map((d) => ({
    id: d.id,
    name: d.name,
    functions: d.functions.map((f) => ({ id: f.id, name: f.name })),
  }));

  return (
    <ProgramasClient
      programs={serializedPrograms}
      departments={departmentOptions}
      canManage={canManage}
      activeChurchId={activeChurchId}
      churchName={churchContext.church?.name}
    />
  );
}
