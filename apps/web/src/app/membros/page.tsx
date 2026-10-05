import React from 'react';
import { prisma } from '@revezo/db';
import { getSession, getCurrentUserContext, getActiveChurchContext } from '@/lib/auth-service';
import { redirect } from 'next/navigation';
import { MembrosClient, MemberListItem, DepartmentOption } from './MembrosClient';
import { can } from '@revezo/domain';

export default async function MembrosPage() {
  const session = await getSession();
  if (!session) {
    redirect('/login');
  }

  const userContext = await getCurrentUserContext();
  if (!userContext || userContext.status !== 'ACTIVE') {
    redirect('/login');
  }

  const churchContext = await getActiveChurchContext();
  const activeChurchId = churchContext?.activeChurch?.id || userContext?.churchId;

  const canListMembers = can(userContext, 'member:list', { churchId: activeChurchId || undefined });
  if (!canListMembers) {
    redirect('/minha-escala');
  }

  const isAdmin = userContext.globalRole === 'ADMIN_MASTER';
  const isPastor = userContext.globalRole === 'PASTOR';
  const isElder = userContext.globalRole === 'ELDER';
  const canManageAll = isAdmin || isPastor || isElder;

  const canAssignElder = can(userContext, 'church:elder:assign', { churchId: activeChurchId || undefined });

  const managedDeptIds = userContext.departmentMemberships
    .filter((m) => m.role === 'MANAGER')
    .map((m) => m.departmentId);

  const memberWhere = canManageAll
    ? {
        status: { in: ['ACTIVE' as const, 'PENDING' as const, 'INACTIVE' as const] },
        ...(activeChurchId ? { churchId: activeChurchId } : {}),
      }
    : {
        status: { in: ['ACTIVE' as const, 'PENDING' as const, 'INACTIVE' as const] },
        memberships: {
          some: {
            departmentId: { in: managedDeptIds },
          },
        },
        ...(activeChurchId ? { churchId: activeChurchId } : {}),
      };

  const deptWhere = canManageAll
    ? (activeChurchId ? { churchId: activeChurchId } : undefined)
    : {
        id: { in: managedDeptIds },
        ...(activeChurchId ? { churchId: activeChurchId } : {}),
      };

  const [users, departments] = await Promise.all([
    prisma.user.findMany({
      where: memberWhere,
      include: {
        memberships: {
          include: {
            department: true,
            functions: {
              include: { function: true },
            },
          },
        },
      },
      orderBy: {
        name: 'asc',
      },
    }),
    prisma.department.findMany({
      where: deptWhere,
      include: {
        functions: {
          orderBy: { name: 'asc' },
        },
      },
      orderBy: {
        name: 'asc',
      },
    }),
  ]);

  const memberListItems: MemberListItem[] = users.map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    globalRole: u.globalRole,
    phonePrimary: u.phonePrimary,
    whatsapp: u.whatsapp,
    photoUrl: u.photoUrl,
    status: u.status as MemberListItem['status'],
    isMinor: u.isMinor,
    guardianName: u.guardianName,
    guardianPhone: u.guardianPhone,
    birthDate: u.birthDate ? u.birthDate.toISOString().split('T')[0] : null,
    notes: u.notes,
    memberships: u.memberships.map((m) => ({
      id: m.id,
      departmentId: m.departmentId,
      departmentName: m.department.name,
      role: m.role as 'MANAGER' | 'MEMBER',
      functions: m.functions.map((f) => ({
        id: f.function.id,
        name: f.function.name,
      })),
    })),
  }));

  const departmentOptions: DepartmentOption[] = departments.map((d) => ({
    id: d.id,
    name: d.name,
    functions: d.functions.map((f) => ({
      id: f.id,
      name: f.name,
    })),
  }));

  return (
    <MembrosClient
      initialMembers={memberListItems}
      departments={departmentOptions}
      isAdmin={isAdmin}
      isPastor={isPastor}
      isElder={isElder}
      canAssignElder={canAssignElder}
      currentChurchId={activeChurchId || null}
      currentChurchName={churchContext?.activeChurch?.name || ''}
      managedDepartmentIds={managedDeptIds}
    />
  );
}
