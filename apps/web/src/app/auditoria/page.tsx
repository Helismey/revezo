import React from 'react';
import { queryAuditLogs } from '@revezo/db';
import { getSession, getCurrentUserContext, getActiveChurchContext } from '@/lib/auth-service';
import { redirect } from 'next/navigation';
import { can } from '@revezo/domain';
import AuditoriaClient from './AuditoriaClient';

export default async function AuditoriaPage() {
  const session = await getSession();
  if (!session) {
    redirect('/login');
  }

  const userContext = await getCurrentUserContext();
  const allowed = can(userContext, 'audit:view');

  if (!allowed) {
    redirect('/');
  }

  const { activeChurch } = await getActiveChurchContext();

  const initialData = await queryAuditLogs({
    churchId: activeChurch?.id,
    page: 1,
    limit: 50,
  });

  const serializedItems = initialData.items.map((item) => ({
    ...item,
    createdAt: item.createdAt.toISOString(),
  }));

  return (
    <AuditoriaClient
      initialItems={serializedItems}
      initialPagination={initialData.pagination}
    />
  );
}
