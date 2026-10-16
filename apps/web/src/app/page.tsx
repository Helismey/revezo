import React from 'react';
import Link from 'next/link';
import { prisma, confirmAssignmentWithAudit, declineWithAutoSubstitution } from '@revezo/db';
import { getSession, getCurrentUserContext, getActiveChurchContext } from '@/lib/auth-service';
import { notifyAutoSubstitution } from '@/services/notifications/swap-and-sub-notifications';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { can } from '@revezo/domain';
import { CalendarBlank, Warning, ArrowsLeftRight, ChartBar, Check } from '@/components/Icons';

export default async function DashboardPage() {
  const session = await getSession();
  if (!session) {
    redirect('/login');
  }

  const userContext = await getCurrentUserContext();
  const churchContext = await getActiveChurchContext();
  const activeChurchId = churchContext?.activeChurch?.id || userContext?.churchId;
  const now = new Date();

  // 1. Busca a próxima escala do voluntário
  type AssignmentWithSlot = NonNullable<Awaited<ReturnType<typeof prisma.assignment.findFirst<{
    include: {
      slot: {
        include: {
          department: true;
          function: true;
          program: true;
        };
      };
    };
  }>>>>;

  let nextAssignment: AssignmentWithSlot | null = null;
  let upcomingAssignments: AssignmentWithSlot[] = [];

  // Indicadores de Gestão (para Gestor, Ancião, Pastor e Admin)
  const isManager = userContext?.departmentMemberships.some((m) => m.role === 'MANAGER');
  const isAdmin = userContext?.globalRole === 'ADMIN_MASTER';
  const isPastor = userContext?.globalRole === 'PASTOR';
  const isElder = userContext?.globalRole === 'ELDER';
  const canViewManagement = isAdmin || isPastor || isElder || Boolean(isManager);

  let pendingApprovalsCount = 0;
  let totalActiveMembers = 0;
  let upcomingProgramsCount = 0;
  let openSlotsCount = 0;
  let pendingSwapsCount = 0;

  try {
    nextAssignment = await prisma.assignment.findFirst({
      where: {
        userId: session.userId,
        status: { in: ['PENDING', 'CONFIRMED'] },
        slot: {
          startsAt: { gte: now },
        },
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
          startsAt: 'asc',
        },
      },
    });

    upcomingAssignments = await prisma.assignment.findMany({
      where: {
        userId: session.userId,
        status: { in: ['PENDING', 'CONFIRMED'] },
        id: nextAssignment ? { not: nextAssignment.id } : undefined,
        slot: {
          startsAt: { gte: now },
        },
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
          startsAt: 'asc',
        },
      },
      take: 5,
    });

    if (canViewManagement) {
      const isFullChurchAdmin = isAdmin || isPastor || isElder;
      const managedDeptIds = isFullChurchAdmin
        ? undefined
        : userContext?.departmentMemberships
            .filter((m) => m.role === 'MANAGER')
            .map((m) => m.departmentId);

      const [
        approvalsCount,
        membersCount,
        programsCount,
        futureSlots,
        swapsCount,
      ] = await Promise.all([
        prisma.user.count({
          where: {
            status: 'PENDING',
            ...(activeChurchId ? { churchId: activeChurchId } : {}),
          },
        }),
        prisma.user.count({
          where: {
            status: 'ACTIVE',
            ...(activeChurchId ? { churchId: activeChurchId } : {}),
          },
        }),
        prisma.program.count({
          where: {
            date: { gte: now },
            ...(activeChurchId ? { churchId: activeChurchId } : {}),
          },
        }),
        prisma.programSlot.findMany({
          where: {
            startsAt: { gte: now },
            ...(activeChurchId ? { program: { churchId: activeChurchId } } : {}),
            ...(managedDeptIds ? { departmentId: { in: managedDeptIds } } : {}),
          },
          include: {
            assignments: {
              where: { status: { in: ['PENDING', 'CONFIRMED'] } },
            },
          },
        }),
        prisma.swapRequest.count({
          where: {
            status: 'PENDING_MANAGER',
            ...(activeChurchId ? { assignment: { slot: { program: { churchId: activeChurchId } } } } : {}),
            ...(managedDeptIds ? { assignment: { slot: { departmentId: { in: managedDeptIds } } } } : {}),
          },
        }),
      ]);

      pendingApprovalsCount = approvalsCount;
      totalActiveMembers = membersCount;
      upcomingProgramsCount = programsCount;
      openSlotsCount = futureSlots.filter((s) => s.assignments.length < s.requiredCount).length;
      pendingSwapsCount = swapsCount;
    }
  } catch {
    // Tolerante a falha de banco no teste ou desconexão temporária
  }

  // Server Actions para confirmar ou recusar escala
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

    revalidatePath('/');
    revalidatePath('/slots-abertos');
  }

  return (
    <div className="space-y-8">
      {/* Saudação */}
      <div>
        <h1 className="font-display font-bold text-2xl sm:text-3xl text-ink">
          Olá, {session.name.split(' ')[0]}!
        </h1>
        <p className="text-sm text-ink-muted mt-1">
          Acompanhe suas escalas e participe dos ministérios.
        </p>
      </div>

      {/* Cartão de Destaque: "Sua próxima escala" (Direção Visual da Igreja) */}
      <section aria-labelledby="proxima-escala-heading">
        <h2 id="proxima-escala-heading" className="sr-only">Sua próxima escala</h2>

        {nextAssignment ? (
          <div className="bg-surface rounded-surface border border-line p-6 shadow-sm">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <span className="inline-block px-2.5 py-1 text-xs font-bold rounded-control bg-primary/10 text-primary uppercase tracking-wider mb-2">
                  Próxima escala
                </span>
                <p className="font-display font-bold text-xl sm:text-2xl text-ink leading-snug">
                  Você serve em{' '}
                  <span className="text-primary">{nextAssignment.slot.department.name}</span> como{' '}
                  <span className="text-ink">{nextAssignment.slot.function?.name || nextAssignment.slot.title}</span>.
                </p>
                <div className="flex items-center space-x-3 text-sm text-ink-muted mt-2">
                  <span className="font-semibold text-ink">
                    {new Date(nextAssignment.slot.startsAt).toLocaleDateString('pt-BR', {
                      weekday: 'long',
                      day: 'numeric',
                      month: 'long',
                    })}
                  </span>
                  <span>•</span>
                  <span>
                    {new Date(nextAssignment.slot.startsAt).toLocaleTimeString('pt-BR', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}{' '}
                    às{' '}
                    {new Date(nextAssignment.slot.endsAt).toLocaleTimeString('pt-BR', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                </div>
              </div>

              {/* Botões de Ação do Voluntário */}
              <div className="flex items-center space-x-3 pt-2 md:pt-0">
                {nextAssignment.status === 'PENDING' ? (
                  <form action={confirmAction}>
                    <input type="hidden" name="assignmentId" value={nextAssignment.id} />
                    <button
                      type="submit"
                      className="px-5 py-2.5 bg-success text-white font-semibold rounded-control hover:opacity-95 text-sm min-h-touch active:scale-[0.98] transition-all shadow-subtle flex items-center gap-1.5"
                    >
                      <Check size={16} /> Confirmar presença
                    </button>
                  </form>
                ) : (
                  <span className="inline-flex items-center gap-1 px-3 py-1.5 rounded-control text-xs font-bold bg-success-soft text-success-ink">
                    <Check size={14} className="text-success" /> Presença confirmada
                  </span>
                )}

                <form action={declineAction}>
                  <input type="hidden" name="assignmentId" value={nextAssignment.id} />
                  <input type="hidden" name="reason" value="Imprevisto informado pelo voluntário" />
                  <button
                    type="submit"
                    className="px-4 py-2.5 border border-line text-ink-muted hover:text-danger hover:border-danger font-semibold rounded-control text-sm min-h-touch transition-colors"
                  >
                    Desmarcar da escala
                  </button>
                </form>
              </div>
            </div>
          </div>
        ) : (
          <div className="bg-surface rounded-surface border border-line p-8 text-center">
            <div className="w-12 h-12 bg-bg text-ink-muted rounded-full flex items-center justify-center mx-auto mb-3">
              <CalendarBlank size={24} className="text-ink-muted" />
            </div>
            <h3 className="font-display font-bold text-lg text-ink">Nenhuma escala nos próximos dias</h3>
            <p className="text-sm text-ink-muted mt-1 max-w-md mx-auto">
              Você não está escalado(a) nos próximos dias. Quando for, aparecerá aqui.
            </p>
          </div>
        )}
      </section>

      {/* Outras escalas futuras */}
      {upcomingAssignments.length > 0 && (
        <section>
          <h2 className="font-display font-bold text-lg text-ink mb-4">Outras escalas agendadas</h2>
          <div className="bg-surface rounded-surface border border-line divide-y divide-line overflow-hidden">
            {upcomingAssignments.map((asg) => (
              <div key={asg.id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <span className="font-semibold text-ink text-sm sm:text-base block">
                    {asg.slot.program.title} — {asg.slot.function?.name || asg.slot.title}
                  </span>
                  <span className="text-xs text-ink-muted">
                    {asg.slot.department.name} •{' '}
                    {new Date(asg.slot.startsAt).toLocaleDateString('pt-BR', {
                      weekday: 'short',
                      day: 'numeric',
                      month: 'short',
                    })}{' '}
                    às{' '}
                    {new Date(asg.slot.startsAt).toLocaleTimeString('pt-BR', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                </div>

                <div className="flex items-center space-x-2">
                  {asg.status === 'PENDING' ? (
                    <form action={confirmAction}>
                      <input type="hidden" name="assignmentId" value={asg.id} />
                      <button
                        type="submit"
                        className="px-3 py-1.5 bg-success text-white text-xs font-semibold rounded-control min-h-touch"
                      >
                        Confirmar
                      </button>
                    </form>
                  ) : (
                    <span className="text-xs font-bold text-success-ink bg-success-soft px-2.5 py-1 rounded-control">
                      Confirmado
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Painel de Gestão (para Gestor, Ancião, Pastor e Administrador) */}
      {canViewManagement && (
        <section className="pt-4 border-t border-line">
          <h2 className="font-display font-bold text-xl text-ink mb-4">Painel de Gestão</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <Link
              href="/slots-abertos"
              className={`p-5 rounded-surface border transition-colors block ${
                openSlotsCount > 0
                  ? 'bg-warning-soft/30 border-warning/60 hover:border-warning'
                  : 'bg-surface border border-line hover:border-primary'
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-semibold text-ink-muted uppercase tracking-wider block">
                  Vagas Abertas
                </span>
                {openSlotsCount > 0 && <Warning size={18} className="text-warning-ink" />}
              </div>
              <span className={`tabular-nums font-display font-bold text-3xl ${openSlotsCount > 0 ? 'text-warning-ink' : 'text-ink'}`}>
                {openSlotsCount}
              </span>
              <span className="text-xs text-primary font-semibold block mt-2">
                Ver vagas e sugestões →
              </span>
            </Link>

            <Link
              href="/trocas"
              className={`p-5 rounded-surface border transition-colors block ${
                pendingSwapsCount > 0
                  ? 'bg-warning-soft/30 border-warning/60 hover:border-warning'
                  : 'bg-surface border border-line hover:border-primary'
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-semibold text-ink-muted uppercase tracking-wider block">
                  Trocas Pendentes
                </span>
                {pendingSwapsCount > 0 && <ArrowsLeftRight size={18} className="text-warning-ink" />}
              </div>
              <span className={`tabular-nums font-display font-bold text-3xl ${pendingSwapsCount > 0 ? 'text-warning-ink' : 'text-ink'}`}>
                {pendingSwapsCount}
              </span>
              <span className="text-xs text-primary font-semibold block mt-2">
                Revisar pedidos de troca →
              </span>
            </Link>

            <Link
              href="/escalas"
              className="bg-surface p-5 rounded-surface border border-line hover:border-primary transition-colors block"
            >
              <span className="text-xs font-semibold text-ink-muted uppercase tracking-wider block mb-1">
                Programas e Cultos
              </span>
              <span className="tabular-nums font-display font-bold text-3xl text-ink">
                {upcomingProgramsCount}
              </span>
              <span className="text-xs text-primary font-semibold block mt-2">
                Montar escalas →
              </span>
            </Link>

            <Link
              href="/membros"
              className="bg-surface p-5 rounded-surface border border-line hover:border-primary transition-colors block"
            >
              <span className="text-xs font-semibold text-ink-muted uppercase tracking-wider block mb-1">
                Voluntários Ativos
              </span>
              <span className="tabular-nums font-display font-bold text-3xl text-ink">
                {totalActiveMembers}
              </span>
              <span className="text-xs text-primary font-semibold block mt-2">
                Gerenciar equipe →
              </span>
            </Link>

            <Link
              href="/historico"
              className="bg-surface p-5 rounded-surface border border-line hover:border-primary transition-colors block"
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-semibold text-ink-muted uppercase tracking-wider block">
                  Histórico & Relatórios
                </span>
                <ChartBar size={20} className="text-primary" />
              </div>
              <span className="font-display font-bold text-xl text-ink">
                Métricas
              </span>
              <span className="text-xs text-primary font-semibold block mt-2">
                Acessar métricas e CSV →
              </span>
            </Link>

            <Link
              href="/aprovacoes"
              className="bg-surface p-5 rounded-surface border border-line hover:border-primary transition-colors block"
            >
              <span className="text-xs font-semibold text-ink-muted uppercase tracking-wider block mb-1">
                Aprovações Pendentes
              </span>
              <span className="tabular-nums font-display font-bold text-3xl text-ink">
                {pendingApprovalsCount}
              </span>
              <span className="text-xs text-primary font-semibold block mt-2">
                Ver cadastros →
              </span>
            </Link>
          </div>
        </section>
      )}
    </div>
  );
}
