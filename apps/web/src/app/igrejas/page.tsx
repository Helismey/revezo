import React from 'react';
import { prisma } from '@revezo/db';
import { getSession, getCurrentUserContext, getActiveChurchContext } from '@/lib/auth-service';
import { redirect } from 'next/navigation';
import { can } from '@revezo/domain';
import { IgrejasClient, ChurchListItem, PastorOption } from './IgrejasClient';

export default async function IgrejasPage() {
  const session = await getSession();
  if (!session) {
    redirect('/login');
  }

  const [userContext, churchContext] = await Promise.all([
    getCurrentUserContext(),
    getActiveChurchContext(),
  ]);
  if (!userContext || !can(userContext, 'church:create')) {
    redirect('/');
  }

  const activeChurchId = churchContext.church?.id;
  const isMaster = userContext.globalRole === 'ADMIN_MASTER';

  // Busca congregações e lista de pastores disponíveis em paralelo
  const [churches, pastors] = await Promise.all([
    prisma.church.findMany({
      where: isMaster ? undefined : { id: { in: userContext.pastorChurchIds || [] } },
      include: {
        pastors: {
          include: {
            pastor: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
          },
        },
        _count: {
          select: {
            users: true,
            departments: true,
            programs: true,
          },
        },
      },
      orderBy: {
        name: 'asc',
      },
    }),
    isMaster
      ? prisma.user.findMany({
          where: {
            globalRole: 'PASTOR',
            status: 'ACTIVE',
          },
          select: {
            id: true,
            name: true,
            email: true,
          },
          orderBy: {
            name: 'asc',
          },
        })
      : Promise.resolve([]),
  ]);

  const availablePastors: PastorOption[] = pastors.map((p) => ({
    id: p.id,
    name: p.name,
    email: p.email,
  }));

  const serializedChurches: ChurchListItem[] = churches.map((c) => ({
    id: c.id,
    name: c.name,
    slug: c.slug,
    phone: c.phone,
    logoUrl: c.logoUrl,
    primaryColor: c.primaryColor,
    secondaryColor: c.secondaryColor,
    active: c.active,
    address: (c.address as ChurchListItem['address']) || null,
    pastors: c.pastors.map((p) => ({
      id: p.pastor.id,
      name: p.pastor.name,
      email: p.pastor.email,
    })),
    counts: {
      members: c._count.users,
      departments: c._count.departments,
      programs: c._count.programs,
    },
  }));

  return (
    <div className="space-y-6">
      <IgrejasClient
        initialChurches={serializedChurches}
        availablePastors={availablePastors}
        activeChurchId={activeChurchId}
        userRole={userContext.globalRole}
        userId={userContext.id}
      />
    </div>
  );
}
