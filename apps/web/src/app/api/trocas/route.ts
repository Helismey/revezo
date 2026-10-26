import { NextResponse } from 'next/server';
import { prisma } from '@revezo/db';
import { getSession, getCurrentUserContext, getActiveChurchContext } from '@/lib/auth-service';

export async function GET() {
  try {
    const [session, userContext] = await Promise.all([
      getSession(),
      getCurrentUserContext(),
    ]);

    if (!session || !userContext) {
      return NextResponse.json({ success: false, error: 'Não autorizado' }, { status: 401 });
    }

    const userId = session.userId;
    const isAdmin = userContext.globalRole === 'ADMIN_MASTER';
    const isPastor = userContext.globalRole === 'PASTOR';
    const isElder = userContext.globalRole === 'ELDER';
    const managedDeptIds = userContext.departmentMemberships
      .filter((m) => m.role === 'MANAGER')
      .map((m) => m.departmentId);

    const canApprove = isAdmin || isPastor || isElder || managedDeptIds.length > 0;

    // Departamentos aos quais o usuário pertence
    const myDeptIds = userContext.departmentMemberships.map((m) => m.departmentId);

    let churchFilter: any = {};
    if (canApprove) {
      const { activeChurch } = await getActiveChurchContext();

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

    // Executa todas as 3 consultas de listagem de trocas em paralelo
    const [solicitadas, recebidas, paraAprovacao] = await Promise.all([
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

    return NextResponse.json({
      success: true,
      data: {
        solicitadas,
        recebidas,
        paraAprovacao,
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Erro ao listar pedidos de troca';
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
