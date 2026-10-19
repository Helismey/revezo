import React from 'react';
import { redirect } from 'next/navigation';
import { prisma } from '@revezo/db';
import { getSession, getCurrentUserContext } from '@/lib/auth-service';
import {
  can,
  decryptSensitiveJson,
  decryptEmergencyContact,
  decryptOptionalString,
} from '@revezo/domain';
import { PerfilClient } from './PerfilClient';

export default async function PerfilPage() {
  const session = await getSession();
  if (!session) {
    redirect('/login');
  }

  const userContext = await getCurrentUserContext();
  if (!userContext || !can(userContext, 'profile:view:own', { targetUserId: session.userId })) {
    redirect('/login');
  }

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
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
  });

  if (!user) {
    redirect('/login');
  }

  const encryptionKey = process.env.FIELD_ENCRYPTION_KEY || process.env.AUTH_SECRET || null;
  const decryptedAddress = decryptSensitiveJson<Record<string, string>>(user.address, encryptionKey);
  const decryptedEmergencyContact = decryptEmergencyContact(user.emergencyContact, encryptionKey);
  const decryptedNotes = decryptOptionalString(user.notes, encryptionKey);

  const initialData = {
    id: user.id,
    name: user.name,
    email: user.email,
    photoUrl: user.photoUrl,
    birthDate: user.birthDate ? user.birthDate.toISOString().split('T')[0] : '',
    gender: user.gender || '',
    maritalStatus: user.maritalStatus || '',
    phonePrimary: user.phonePrimary || '',
    phoneSecondary: user.phoneSecondary || '',
    whatsapp: user.whatsapp || '',
    address: decryptedAddress || {
      street: '',
      number: '',
      complement: '',
      neighborhood: '',
      city: '',
      state: '',
      postalCode: '',
    },
    emergencyContact: decryptedEmergencyContact || {
      name: '',
      relationship: '',
      phone: '',
    },
    joinedAt: user.joinedAt ? user.joinedAt.toISOString().split('T')[0] : '',
    preferredChannel: user.preferredChannel || 'WHATSAPP',
    notes: decryptedNotes || '',
    globalRole: user.globalRole,
    status: user.status,
    optOutWhatsapp: user.optOutWhatsapp,
    optOutEmail: user.optOutEmail,
    optOutPush: user.optOutPush,
    optOutSms: user.optOutSms,
    termsAcceptedAt: user.termsAcceptedAt ? user.termsAcceptedAt.toISOString() : null,
    termsVersion: user.termsVersion,
    mfaEnabled: user.mfaEnabled,
    recoveryCodesCount: Array.isArray(user.mfaRecoveryCodes) ? user.mfaRecoveryCodes.length : 0,
    memberships: user.memberships.map((m) => ({
      departmentName: m.department.name,
      role: m.role,
      functions: m.functions.map((f) => f.function.name),
    })),
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display font-bold text-2xl sm:text-3xl text-ink">Meu Perfil</h1>
        <p className="text-sm text-ink-muted mt-1">
          Gerencie seus dados pessoais, contatos, preferências de notificação e privacidade.
        </p>
      </div>

      <PerfilClient initialData={initialData} />
    </div>
  );
}
