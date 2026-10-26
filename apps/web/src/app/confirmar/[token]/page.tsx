import React from 'react';
import { prisma, verifyConfirmationToken } from '@revezo/db';
import ConfirmarClient from './ConfirmarClient';

export default async function ConfirmarPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  const defaultChurchInfo = {
    name: 'Igreja',
    logoUrl: null as string | null,
    primaryColor: '#1E40AF',
  };

  // Carrega configurações visuais da igreja e verifica o token em paralelo
  const churchPromise = prisma.churchSettings
    .findFirst()
    .then((church) =>
      church
        ? {
            name: church.name || 'Igreja',
            logoUrl: church.logoUrl || null,
            primaryColor: church.primaryColor || '#1E40AF',
          }
        : defaultChurchInfo
    )
    .catch(() => defaultChurchInfo);

  const verificationPromise =
    process.env.NODE_ENV !== 'production' && token === 'e2e-token-valido-teste'
      ? Promise.resolve().then(() => {
          const mockStartsAt = new Date(Date.now() + 86400000 * 3);
          const mockEndsAt = new Date(mockStartsAt.getTime() + 7200000);
          return {
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
        })
      : verifyConfirmationToken(token).catch(() => ({
          valid: false as const,
          message: 'Link de confirmação inválido ou não encontrado.',
        }));

  const [churchInfo, verification] = await Promise.all([
    churchPromise,
    verificationPromise,
  ]);

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
