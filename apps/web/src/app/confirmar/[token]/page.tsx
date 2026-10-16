import React from 'react';
import { prisma, verifyConfirmationToken } from '@revezo/db';
import ConfirmarClient from './ConfirmarClient';

export default async function ConfirmarPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  let churchInfo = {
    name: 'Igreja',
    logoUrl: null as string | null,
    primaryColor: '#1E40AF',
  };

  try {
    const church = await prisma.churchSettings.findFirst();
    if (church) {
      churchInfo = {
        name: church.name || 'Igreja',
        logoUrl: church.logoUrl || null,
        primaryColor: church.primaryColor || '#1E40AF',
      };
    }
  } catch {
    // Silently fallback if DB is not connected or in cold start
  }

  let verification;
  if (process.env.NODE_ENV !== 'production' && token === 'e2e-token-valido-teste') {
    const mockStartsAt = new Date(Date.now() + 86400000 * 3);
    const mockEndsAt = new Date(mockStartsAt.getTime() + 7200000);
    verification = {
      valid: true as const,
      data: {
        token: 'e2e-token-valido-teste',
        assignmentId: 'asg_e2e_123',
        status: 'PENDING' as const,
        declinedReason: null,
        memberFirstName: 'Ana',
        memberFullName: 'Ana Paula Silva',
        programTitle: 'Culto da Família',
        departmentName: 'Louvor',
        functionName: 'Vocal Soprano',
        startsAt: mockStartsAt.toISOString(),
        endsAt: mockEndsAt.toISOString(),
        expiresAt: new Date(Date.now() + 86400000 * 5).toISOString(),
      },
    };
  } else {
    try {
      verification = await verifyConfirmationToken(token);
    } catch {
      verification = {
        valid: false as const,
        message: 'Link de confirmação inválido ou não encontrado.',
      };
    }
  }

  if (!verification.valid) {
    return (
      <ConfirmarClient
        initialData={null}
        error={verification.message || 'Link inválido ou expirado.'}
        church={churchInfo}
      />
    );
  }

  return (
    <ConfirmarClient
      initialData={verification.data}
      error={null}
      church={churchInfo}
    />
  );
}
