import React from 'react';
import { prisma, confirmAssignmentWithAudit, declineWithAutoSubstitution } from '@revezo/db';
import { detectVolunteerOverload } from '@revezo/domain';
import { getSession } from '@/lib/auth-service';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';

import { CalendarSubscriptionButton } from '@/components/CalendarSubscriptionButton';
import { HandsPraying } from '@/components/Icons';
import { notifyAutoSubstitution } from '@/services/notifications/swap-and-sub-notifications';
import { MinhaEscalaClient, VolunteerAssignmentItem } from './MinhaEscalaClient';

export default async function MinhaEscalaPage() {
  const session = await getSession();
  if (!session) {
    redirect('/login');
  }

  // Não exibe atribuições em PENDING_APPROVAL para o voluntário até a aprovação do líder de departamento
  const assignments = await prisma.assignment.findMany({
    where: {
      userId: session.userId,
      status: { not: 'PENDING_APPROVAL' },
    },
    include: {
      slot: {
        include: {
          department: true,
          function: true,
          program: true,
        },
      },
    },
    orderBy: {
      slot: {
        startsAt: 'desc',
      },
    },
  });

  const overloadAlert = detectVolunteerOverload(
    assignments.map((a) => ({
      id: a.id,
      startsAt: a.slot.startsAt,
      endsAt: a.slot.endsAt,
      status: a.status,
    }))
  );

  async function confirmAction(formData: FormData) {
    'use server';
    const currentSession = await getSession();
    if (!currentSession) return;

    const assignmentId = formData.get('assignmentId') as string;
    if (!assignmentId) return;

    await confirmAssignmentWithAudit({
      assignmentId,
      actorId: currentSession.userId,
    });

    revalidatePath('/minha-escala');
    revalidatePath('/');
  }

  async function declineAction(formData: FormData) {
    'use server';
    const currentSession = await getSession();
    if (!currentSession) return;

    const assignmentId = formData.get('assignmentId') as string;
    const reason = formData.get('reason') as string;
    if (!assignmentId) return;

    const result = await declineWithAutoSubstitution({
      assignmentId,
      reason,
      actorId: currentSession.userId,
    });

    if (result.autoSubstituted && result.newAssignment) {
      notifyAutoSubstitution({
        substituteAssignmentId: result.newAssignment.id,
        originalAssignmentId: assignmentId,
        reason,
        actorId: currentSession.userId,
      }).catch((err) => console.error('Erro ao notificar substituto:', err));
    }

    revalidatePath('/minha-escala');
    revalidatePath('/');
    revalidatePath('/slots-abertos');
  }

  // Serializa dados com tipos seguros para o componente cliente
  const serializedAssignments: VolunteerAssignmentItem[] = assignments.map((a) => ({
    id: a.id,
    status: a.status as 'PENDING' | 'CONFIRMED' | 'DECLINED' | 'SUBSTITUTED',
    declinedReason: a.declinedReason,
    slot: {
      id: a.slot.id,
      title: a.slot.title,
      startsAt: a.slot.startsAt.toISOString(),
      endsAt: a.slot.endsAt.toISOString(),
      department: {
        id: a.slot.department.id,
        name: a.slot.department.name,
      },
      function: a.slot.function
        ? {
            id: a.slot.function.id,
            name: a.slot.function.name,
          }
        : null,
      program: {
        id: a.slot.program.id,
        title: a.slot.program.title,
      },
    },
  }));

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display font-bold text-2xl sm:text-3xl text-ink">Minha Escala</h1>
          <p className="text-sm text-ink-muted mt-1">
            Confira seus compromissos no calendário, confirme sua presença ou avise sobre imprevistos.
          </p>
        </div>

        <CalendarSubscriptionButton />
      </div>

      {overloadAlert.isOverloaded && (
        <div className="bg-warning-soft border border-warning/40 rounded-surface p-4 flex items-start gap-3">
          <HandsPraying size={22} weight="fill" className="text-warning-ink flex-shrink-0 mt-0.5" />
          <div>
            <h3 className="font-semibold text-sm text-warning-ink">
              Atenção para o seu descanso
            </h3>
            <p className="text-xs text-ink-muted mt-0.5">
              Você serviu em {overloadAlert.consecutiveWeekends} fins de semana seguidos ({overloadAlert.assignmentsIn30Days} escalas no mês). Lembre-se de reservar momentos de descanso e culto com sua família.
            </p>
          </div>
        </div>
      )}

      <MinhaEscalaClient
        assignments={serializedAssignments}
        confirmAction={confirmAction}
        declineAction={declineAction}
      />
    </div>
  );
}
