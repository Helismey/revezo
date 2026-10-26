import React from 'react';
import { getSession, getCurrentUserContext, getActiveChurchContext } from '@/lib/auth-service';
import { redirect } from 'next/navigation';
import { prisma } from '@revezo/db';
import TrocasClient from './TrocasClient';

export default async function TrocasPage() {
  const [session, userContext, { activeChurch }] = await Promise.all([
    getSession(),
    getCurrentUserContext(),
    getActiveChurchContext(),
  ]);

  if (!session || !userContext) {
    redirect('/login');
  }

  const userId = session.userId;
  const isAdmin = userContext.globalRole === 'ADMIN_MASTER';
  const isPastor = userContext.globalRole === 'PASTOR';
  const isElder = userContext.globalRole === 'ELDER';
  const managedDeptIds = userContext.departmentMemberships
    .filter((m) => m.role === 'MANAGER')
    .map((m) => m.departmentId);

  const canApprove = Boolean(isAdmin || isPastor || isElder || managedDeptIds.length > 0);

  const myDeptIds = userContext.departmentMemberships.map((m) => m.departmentId);
  const now = new Date();

  // Filtro de escopo para pedidos aguardando aprovação de gestor/liderança
  let churchFilter: any = {};
  if (canApprove) {
    if (activeChurch) {
      if (
        isAdmin ||
        (isPastor && Boolean(userContext.pastorChurchIds?.includes(activeChurch.id))) ||
        (isElder && userContext.churchId === activeChurch.id)
      ) {
        churchFilter = {
          assignment: {
            slot: {
              department: {
                churchId: activeChurch.id,
              },
            },
          },
        };
      } else if (managedDeptIds.length > 0) {
        churchFilter = {
          assignment: {
            slot: {
              departmentId: { in: managedDeptIds },
              department: {
                churchId: activeChurch.id,
              },
            },
          },
        };
      }
    } else {
      if (isPastor) {
        churchFilter = {
          assignment: {
            slot: {
              department: {
                churchId: { in: userContext.pastorChurchIds || [] },
              },
            },
          },
        };
      } else if (isElder) {
        churchFilter = {
          assignment: {
            slot: {
              department: {
                churchId: userContext.churchId,
              },
            },
          },
        };
      } else if (!isAdmin) {
        churchFilter = {
          assignment: {
            slot: {
              departmentId: { in: managedDeptIds },
            },
          },
        };
      }
    }
  }

  // Executa todas as 5 consultas necessárias em paralelo no servidor (elimina waterfall client-side)
  const [myFutureAssignments, potentialTargets, solicitadas, recebidas, paraAprovacao] =
    await Promise.all([
      prisma.assignment.findMany({
        where: {
          userId,
          status: { in: ['PENDING', 'CONFIRMED'] },
          slot: { startsAt: { gte: now } },
        },
        include: {
          slot: {
            include: {
              program: true,
              department: true,
              function: true,
            },
          },
        },
        orderBy: { slot: { startsAt: 'asc' } },
      }),
      prisma.user.findMany({
        where: {
          status: 'ACTIVE',
          id: { not: userId },
          ...(activeChurch ? { churchId: activeChurch.id } : {}),
          memberships: {
            some: {
              departmentId: { in: myDeptIds },
            },
          },
        },
        select: {
          id: true,
          name: true,
          photoUrl: true,
          memberships: {
            select: {
              departmentId: true,
              functions: { select: { functionId: true } },
            },
          },
        },
        orderBy: { name: 'asc' },
      }),
      prisma.swapRequest.findMany({
        where: { requesterId: userId },
        include: {
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
          targetUser: {
            select: { id: true, name: true, photoUrl: true },
          },
          reviewedBy: {
            select: { id: true, name: true },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.swapRequest.findMany({
        where: {
          status: 'PENDING_TARGET',
          requesterId: { not: userId },
          OR: [
            { targetUserId: userId },
            {
              targetUserId: null,
              assignment: {
                slot: {
                  departmentId: { in: myDeptIds },
                },
              },
            },
          ],
        },
        include: {
          requester: {
            select: { id: true, name: true, photoUrl: true },
          },
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
        orderBy: { createdAt: 'desc' },
      }),
      canApprove
        ? prisma.swapRequest.findMany({
            where: {
              status: 'PENDING_MANAGER',
              ...churchFilter,
            },
            include: {
              requester: {
                select: { id: true, name: true, photoUrl: true },
              },
              targetUser: {
                select: { id: true, name: true, photoUrl: true },
              },
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
              reviewedBy: {
                select: { id: true, name: true },
              },
            },
            orderBy: { updatedAt: 'desc' },
          })
        : Promise.resolve([]),
    ]);

  const serializeSwap = (item: any) => ({
    ...item,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
    assignment: {
      slot: {
        program: { title: item.assignment.slot.program.title },
        department: { name: item.assignment.slot.department.name },
        function: item.assignment.slot.function ? { name: item.assignment.slot.function.name } : null,
        title: item.assignment.slot.title,
        startsAt: item.assignment.slot.startsAt.toISOString(),
        endsAt: item.assignment.slot.endsAt.toISOString(),
      },
    },
  });

  return (
    <TrocasClient
      userId={userId}
      isAdmin={isAdmin}
      isManager={canApprove}
      myFutureAssignments={myFutureAssignments.map((a) => ({
        id: a.id,
        programTitle: a.slot.program.title,
        departmentId: a.slot.departmentId,
        departmentName: a.slot.department.name,
        functionId: a.slot.functionId,
        functionName: a.slot.function?.name || a.slot.title,
        startsAt: a.slot.startsAt.toISOString(),
        endsAt: a.slot.endsAt.toISOString(),
      }))}
      potentialTargets={potentialTargets}
      initialSwaps={{
        solicitadas: solicitadas.map(serializeSwap),
        recebidas: recebidas.map(serializeSwap),
        paraAprovacao: paraAprovacao.map(serializeSwap),
      }}
    />
  );
}
