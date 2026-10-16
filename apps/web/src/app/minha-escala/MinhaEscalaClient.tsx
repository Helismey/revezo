'use client';

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import { CalendarMonthView, CalendarEventItem } from '@/components/CalendarMonthView';
import { ListBullets, Calendar, Check, ArrowsLeftRight, X, Warning } from '@/components/Icons';

export interface VolunteerAssignmentItem {
  id: string;
  status: 'PENDING' | 'CONFIRMED' | 'DECLINED' | 'SUBSTITUTED';
  declinedReason?: string | null;
  slot: {
    id: string;
    title: string;
    startsAt: string;
    endsAt: string;
    department: {
      id: string;
      name: string;
    };
    function?: {
      id: string;
      name: string;
    } | null;
    program: {
      id: string;
      title: string;
    };
  };
}

interface MinhaEscalaClientProps {
  assignments: VolunteerAssignmentItem[];
  confirmAction: (formData: FormData) => Promise<void>;
  declineAction: (formData: FormData) => Promise<void>;
}

export function MinhaEscalaClient({
  assignments,
  confirmAction,
  declineAction,
}: MinhaEscalaClientProps) {
  const [viewMode, setViewMode] = useState<'list' | 'calendar'>('list');
  const [selectedDeptId, setSelectedDeptId] = useState('');
  const [declineTarget, setDeclineTarget] = useState<VolunteerAssignmentItem | null>(null);
  const [declineReason, setDeclineReason] = useState('');
  const [isSubmittingDecline, setIsSubmittingDecline] = useState(false);

  // Departamentos distintos em que o voluntário está escalado
  const departments = useMemo(() => {
    const map = new Map<string, string>();
    for (const a of assignments) {
      map.set(a.slot.department.id, a.slot.department.name);
    }
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [assignments]);

  // Eventos mapeados para o componente de calendário
  const calendarEvents = useMemo<CalendarEventItem[]>(() => {
    return assignments.map((asg) => {
      const startsAt = new Date(asg.slot.startsAt);
      const endsAt = new Date(asg.slot.endsAt);
      const timeStr = `${startsAt.toLocaleTimeString('pt-BR', {
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'America/Sao_Paulo',
      })} - ${endsAt.toLocaleTimeString('pt-BR', {
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'America/Sao_Paulo',
      })}`;

      return {
        id: asg.id,
        title: `${asg.slot.department.name} (${asg.slot.function?.name || asg.slot.title})`,
        date: asg.slot.startsAt,
        time: timeStr,
        departmentName: asg.slot.department.name,
        departmentId: asg.slot.department.id,
        status: asg.status,
        subtitle: `Culto: ${asg.slot.program.title} • Função: ${asg.slot.function?.name || asg.slot.title}`,
        meta: asg,
      };
    });
  }, [assignments]);

  return (
    <div className="space-y-4">
      {/* Barra de alternância de visão */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center bg-bg rounded-control p-1 border border-line">
          <button
            type="button"
            onClick={() => setViewMode('list')}
            className={`px-3 py-1.5 rounded-control text-xs font-semibold transition-all inline-flex items-center gap-1.5 min-h-touch ${
              viewMode === 'list'
                ? 'bg-surface text-ink shadow-sm'
                : 'text-ink-muted hover:text-ink'
            }`}
          >
            <ListBullets size={16} weight={viewMode === 'list' ? 'fill' : 'regular'} />
            Lista
          </button>
          <button
            type="button"
            onClick={() => setViewMode('calendar')}
            className={`px-3 py-1.5 rounded-control text-xs font-semibold transition-all inline-flex items-center gap-1.5 min-h-touch ${
              viewMode === 'calendar'
                ? 'bg-surface text-ink shadow-sm'
                : 'text-ink-muted hover:text-ink'
            }`}
          >
            <Calendar size={16} weight={viewMode === 'calendar' ? 'fill' : 'regular'} />
            Meu Calendário
          </button>
        </div>
      </div>

      {viewMode === 'calendar' ? (
        <CalendarMonthView
          events={calendarEvents}
          departments={departments}
          selectedDepartmentId={selectedDeptId}
          onSelectDepartmentId={setSelectedDeptId}
          canAddEvent={false}
          emptyStateMessage="Você não possui nenhuma escala agendada para este dia."
        />
      ) : assignments.length === 0 ? (
        <div className="bg-surface rounded-surface border border-line p-8 text-center shadow-sm">
          <p className="text-ink-muted text-sm">
            Você não está escalado(a) nos próximos dias. Quando for escalado(a), aparecerá aqui.
          </p>
        </div>
      ) : (
        <div className="bg-surface rounded-surface border border-line divide-y divide-line overflow-hidden shadow-sm">
          {assignments.map((asg) => {
            const isPast = new Date(asg.slot.endsAt) < new Date();
            const startsAt = new Date(asg.slot.startsAt);
            const endsAt = new Date(asg.slot.endsAt);

            return (
              <div
                key={asg.id}
                className="p-4 sm:p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:bg-bg/40 transition-colors"
              >
                <div className="space-y-1">
                  <div className="flex items-center space-x-2">
                    <span className="font-display font-bold text-base sm:text-lg text-ink">
                      {asg.slot.program.title}
                    </span>
                    <span
                      className={`text-[11px] font-bold px-2 py-0.5 rounded-control uppercase tracking-wider ${
                        asg.status === 'CONFIRMED'
                          ? 'bg-success-soft text-success-ink'
                          : asg.status === 'DECLINED'
                          ? 'bg-danger-soft text-danger-ink'
                          : asg.status === 'SUBSTITUTED'
                          ? 'bg-info-soft text-primary'
                          : 'bg-warning-soft text-warning-ink'
                      }`}
                    >
                      {asg.status === 'CONFIRMED'
                        ? 'Confirmado'
                        : asg.status === 'DECLINED'
                        ? 'Desmarcado'
                        : asg.status === 'SUBSTITUTED'
                        ? 'Substituído'
                        : 'Pendente'}
                    </span>
                  </div>

                  <p className="text-sm text-ink font-semibold">
                    {asg.slot.department.name} — {asg.slot.function?.name || asg.slot.title}
                  </p>

                  <p className="text-xs text-ink-muted">
                    {startsAt.toLocaleDateString('pt-BR', {
                      weekday: 'long',
                      day: 'numeric',
                      month: 'long',
                      year: 'numeric',
                      timeZone: 'America/Sao_Paulo',
                    })}{' '}
                    •{' '}
                    <span className="tabular-nums">
                      {startsAt.toLocaleTimeString('pt-BR', {
                        hour: '2-digit',
                        minute: '2-digit',
                        timeZone: 'America/Sao_Paulo',
                      })}{' '}
                      às{' '}
                      {endsAt.toLocaleTimeString('pt-BR', {
                        hour: '2-digit',
                        minute: '2-digit',
                        timeZone: 'America/Sao_Paulo',
                      })}
                    </span>
                  </p>

                  {asg.declinedReason && (
                    <p className="text-xs text-danger font-medium mt-1">
                      Motivo da desmarcação: {asg.declinedReason}
                    </p>
                  )}
                </div>

                {!isPast && asg.status !== 'DECLINED' && asg.status !== 'SUBSTITUTED' && (
                  <div className="flex items-center space-x-2 flex-wrap gap-y-2">
                    {asg.status === 'PENDING' && (
                      <form action={confirmAction}>
                        <input type="hidden" name="assignmentId" value={asg.id} />
                        <button
                          type="submit"
                          className="px-4 py-2 bg-success text-white font-semibold rounded-control text-xs sm:text-sm hover:bg-success/90 min-h-touch transition-all shadow-sm inline-flex items-center gap-1.5"
                        >
                          <Check size={16} weight="bold" /> Confirmar presença
                        </button>
                      </form>
                    )}

                    <Link
                      href="/trocas"
                      className="px-3.5 py-2 border border-line text-ink hover:text-primary hover:border-primary font-semibold rounded-control text-xs sm:text-sm min-h-touch transition-colors inline-flex items-center gap-1.5"
                    >
                      <ArrowsLeftRight size={16} /> Pedir Troca
                    </Link>

                    <button
                      type="button"
                      onClick={() => {
                        setDeclineTarget(asg);
                        setDeclineReason('');
                      }}
                      className="px-3.5 py-2 border border-line text-ink-muted hover:text-danger hover:border-danger font-semibold rounded-control text-xs sm:text-sm min-h-touch transition-colors inline-flex items-center gap-1.5"
                    >
                      <X size={16} /> Desmarcar
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Modal de Desmarcação com Verificação de Urgência (<24h) */}
      {declineTarget && (() => {
        const hoursUntilStart = (new Date(declineTarget.slot.startsAt).getTime() - Date.now()) / (1000 * 60 * 60);
        const isUrgent = hoursUntilStart > 0 && hoursUntilStart < 24;

        const handleConfirmDecline = async (e: React.FormEvent) => {
          e.preventDefault();
          setIsSubmittingDecline(true);
          try {
            const formData = new FormData();
            formData.set('assignmentId', declineTarget.id);
            const prefix = isUrgent ? '[URGENTE <24H] ' : '';
            formData.set('reason', `${prefix}${declineReason.trim() || 'Imprevisto informado pelo voluntário'}`);
            await declineAction(formData);
            setDeclineTarget(null);
            setDeclineReason('');
          } finally {
            setIsSubmittingDecline(false);
          }
        };

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/60 backdrop-blur-sm animate-in fade-in duration-150">
            <div className="bg-surface w-full max-w-md rounded-surface border border-line shadow-2xl p-6 space-y-4">
              <div className="flex items-center justify-between border-b border-line pb-3">
                <h3 className="font-display font-bold text-lg text-ink">
                  Desmarcar da Escala
                </h3>
                <button
                  type="button"
                  onClick={() => setDeclineTarget(null)}
                  className="text-ink-muted hover:text-ink p-1 rounded-control"
                >
                  <X size={20} />
                </button>
              </div>

              <div>
                <p className="text-sm text-ink">
                  Você está solicitando desmarcação em{' '}
                  <strong className="text-primary">{declineTarget.slot.department.name}</strong>{' '}
                  ({declineTarget.slot.function?.name || declineTarget.slot.title}).
                </p>
                <p className="text-xs text-ink-muted mt-1">
                  Culto: <strong>{declineTarget.slot.program.title}</strong> •{' '}
                  {new Date(declineTarget.slot.startsAt).toLocaleDateString('pt-BR', {
                    weekday: 'short',
                    day: 'numeric',
                    month: 'short',
                    timeZone: 'America/Sao_Paulo',
                  })}{' '}
                  às{' '}
                  {new Date(declineTarget.slot.startsAt).toLocaleTimeString('pt-BR', {
                    hour: '2-digit',
                    minute: '2-digit',
                    timeZone: 'America/Sao_Paulo',
                  })}
                </p>
              </div>

              {/* Alerta de Urgência (<24h) */}
              {isUrgent && (
                <div className="bg-warning-soft border border-warning/50 rounded-control p-3.5 flex items-start gap-3 text-warning-ink">
                  <Warning size={20} className="shrink-0 mt-0.5 text-warning-ink" />
                  <div className="text-xs space-y-1">
                    <p className="font-bold">Atenção: Este culto acontece em menos de 24 horas!</p>
                    <p>
                      A liderança será acionada imediatamente para buscar um substituto.
                      Se possível, entre em contato direto pelo WhatsApp com o gestor da sua equipe.
                    </p>
                  </div>
                </div>
              )}

              <form onSubmit={handleConfirmDecline} className="space-y-4">
                <div>
                  <label htmlFor="decline-reason" className="block text-xs font-semibold text-ink mb-1">
                    Motivo da ausência:
                  </label>
                  <textarea
                    id="decline-reason"
                    rows={3}
                    required
                    value={declineReason}
                    onChange={(e) => setDeclineReason(e.target.value)}
                    placeholder="Ex: Viagem inadiável, motivo de saúde familiar..."
                    className="w-full p-2.5 bg-surface border border-field-border rounded-control text-ink text-sm focus:ring-2 focus:ring-primary outline-none"
                  />
                </div>

                <div className="flex items-center justify-end gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setDeclineTarget(null)}
                    disabled={isSubmittingDecline}
                    className="px-4 py-2 border border-line rounded-control text-sm font-semibold text-ink-muted hover:text-ink min-h-touch"
                  >
                    Voltar
                  </button>

                  <button
                    type="submit"
                    disabled={isSubmittingDecline || !declineReason.trim()}
                    className="px-4 py-2 bg-danger text-white rounded-control text-sm font-semibold hover:bg-danger-dark disabled:opacity-50 min-h-touch shadow-sm"
                  >
                    {isSubmittingDecline ? 'Desmarcando...' : 'Confirmar desmarcação'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
