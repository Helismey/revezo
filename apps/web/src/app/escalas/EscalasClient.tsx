'use client';

import React, { useState } from 'react';
import { AlertBanner } from '@/components/AlertBanner';
import {
  Sparkle,
  Lightbulb,
  Check,
  X,
  WhatsappLogo,
  Trash,
  Plus,
  Warning,
  Printer,
} from '@/components/Icons';
import { SchedulePrintModal } from '@/components/SchedulePrintModal';
import { ConfirmDialog } from '@/components/Modal';
import { isDateInUnavailablePeriods, matchesPreferredWeekdays } from '@revezo/domain';

export interface SerializedSlot {
  id: string;
  title: string;
  departmentId: string;
  departmentName: string;
  functionId?: string | null;
  functionName?: string | null;
  startsAt: string;
  endsAt: string;
  requiredCount: number;
  assignments: {
    id: string;
    userId: string;
    userName: string;
    status: string;
  }[];
}

export interface SerializedProgram {
  id: string;
  title: string;
  date: string;
  slots: SerializedSlot[];
}

export interface AvailableVolunteer {
  id: string;
  name: string;
  departmentIds: string[];
  functionIds: string[];
  availabilities?: {
    kind: 'PREFERRED_WEEKDAY' | 'UNAVAILABLE_PERIOD';
    weekday?: number | null;
    from?: string | null;
    to?: string | null;
  }[];
  isOverloaded?: boolean;
  consecutiveWeekendsCount?: number;
  assignmentsIn30Days?: number;
}

interface EscalasClientProps {
  programs: SerializedProgram[];
  volunteers: AvailableVolunteer[];
  isManagerOrAdmin: boolean;
  canManageAll?: boolean;
  managedDepartmentIds?: string[];
}

export function EscalasClient({
  programs,
  volunteers,
  isManagerOrAdmin,
  canManageAll = false,
  managedDepartmentIds = [],
}: EscalasClientProps) {
  const [selectedProgramId, setSelectedProgramId] = useState<string>(
    programs[0]?.id || ''
  );
  const [activeSlotId, setActiveSlotId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: 'sucesso' | 'erro'; text: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [copiedAssignmentId, setCopiedAssignmentId] = useState<string | null>(null);

  // Estados para a Geração Automática (Fase 4)
  const [showAutoModal, setShowAutoModal] = useState(false);
  const [showPrintModal, setShowPrintModal] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [autoPreview, setAutoPreview] = useState<{
    proposals: {
      slotId: string;
      slotTitle: string;
      startsAt: string;
      endsAt: string;
      candidate: { id: string; name: string };
      reason: string;
    }[];
    unfilledSlots: {
      slotId: string;
      slotTitle: string;
      missingCount: number;
      diagnosis: string;
    }[];
    totalFilled: number;
  } | null>(null);
  const [selectedVolunteerId, setSelectedVolunteerId] = useState<string>('');
  const [selectedProposals, setSelectedProposals] = useState<Set<string>>(new Set());

  // Função para solicitar prévia de escala automática
  const handleOpenAutoSchedule = async () => {
    if (!currentProgram) return;
    setMessage(null);
    setIsGenerating(true);
    setShowAutoModal(true);

    try {
      const res = await fetch('/api/escalas/gerar-preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ programId: currentProgram.id }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setMessage({
          type: 'erro',
          text: data.error || 'Erro ao gerar prévia da escala automática.',
        });
        setShowAutoModal(false);
        return;
      }

      setAutoPreview(data.data);
      // Seleciona todas as propostas por padrão
      const allProposalKeys = new Set<string>(
        data.data.proposals.map((p: any) => `${p.slotId}-${p.candidate.id}`)
      );
      setSelectedProposals(allProposalKeys);
    } catch {
      setMessage({
        type: 'erro',
        text: 'Falha de comunicação ao gerar prévia da escala.',
      });
      setShowAutoModal(false);
    } finally {
      setIsGenerating(false);
    }
  };

  // Função para aplicar as atribuições propostas
  const handleApplyAutoSchedule = async () => {
    if (!autoPreview || !currentProgram) return;
    setLoading(true);
    setMessage(null);

    const assignmentsToApply = autoPreview.proposals
      .filter((p) => selectedProposals.has(`${p.slotId}-${p.candidate.id}`))
      .map((p) => ({
        slotId: p.slotId,
        userId: p.candidate.id,
      }));

    if (assignmentsToApply.length === 0) {
      setMessage({
        type: 'erro',
        text: 'Nenhuma escala foi selecionada para aplicação.',
      });
      setLoading(false);
      return;
    }

    try {
      const res = await fetch('/api/escalas/aplicar-geracao', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          programId: currentProgram.id,
          assignments: assignmentsToApply,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setMessage({
          type: 'erro',
          text: data.error || 'Erro ao aplicar geração de escalas.',
        });
        return;
      }

      setMessage({
        type: 'sucesso',
        text: data.message || `${data.data.createdCount} escala(s) aplicada(s) com sucesso!`,
      });
      setShowAutoModal(false);
      window.location.reload();
    } catch {
      setMessage({
        type: 'erro',
        text: 'Erro ao conectar com o servidor para aplicar escalas.',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleCopyConfirmationLink = async (assignmentId: string) => {
    try {
      const res = await fetch('/api/escalas/token-confirmacao', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assignmentId }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setMessage({ type: 'erro', text: data.error || 'Erro ao gerar link de confirmação' });
        return;
      }
      await navigator.clipboard.writeText(data.whatsappMessage || data.confirmationUrl);
      setCopiedAssignmentId(assignmentId);
      setMessage({
        type: 'sucesso',
        text: 'Mensagem com link de confirmação copiada! Cole no WhatsApp do voluntário.',
      });
      setTimeout(() => setCopiedAssignmentId(null), 4000);
    } catch {
      setMessage({ type: 'erro', text: 'Não foi possível copiar o link de confirmação.' });
    }
  };

  const handleQuickApprove = async (assignmentId: string) => {
    setLoading(true);
    setMessage(null);
    try {
      const res = await fetch('/api/escalas/aprovar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assignmentIds: [assignmentId] }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Erro ao aprovar escala');
      }
      setMessage({
        type: 'sucesso',
        text: 'Escala aprovada com sucesso! O voluntário já pode visualizar e confirmar a presença.',
      });
      window.location.reload();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Falha ao aprovar escala';
      setMessage({ type: 'erro', text: msg });
    } finally {
      setLoading(false);
    }
  };

  const currentProgram = programs.find((p) => p.id === selectedProgramId);

  const handleAssign = async (slotId: string) => {
    if (!selectedVolunteerId) return;
    setMessage(null);
    setLoading(true);

    try {
      const res = await fetch('/api/escalas/atribuir', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slotId,
          userId: selectedVolunteerId,
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        setMessage({
          type: 'erro',
          text: data.error || 'Não foi possível atribuir a escala.',
        });
        return;
      }

      setMessage({
        type: 'sucesso',
        text: 'Voluntário escalado com sucesso!',
      });
      setActiveSlotId(null);
      setSelectedVolunteerId('');
      // Recarrega a página para atualizar as atribuições
      window.location.reload();
    } catch {
      setMessage({
        type: 'erro',
        text: 'Erro de comunicação ao salvar escala.',
      });
    } finally {
      setLoading(false);
    }
  };

  const [pendingRemoveAssignmentId, setPendingRemoveAssignmentId] = useState<string | null>(null);

  const handleRemove = async (assignmentId: string) => {
    setMessage(null);
    setLoading(true);

    try {
      const res = await fetch('/api/escalas/remover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assignmentId }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        setMessage({
          type: 'erro',
          text: data.error || 'Erro ao remover voluntário da escala.',
        });
        return;
      }

      setMessage({
        type: 'sucesso',
        text: 'Escala removida com sucesso.',
      });
      setPendingRemoveAssignmentId(null);
      window.location.reload();
    } catch {
      setMessage({
        type: 'erro',
        text: 'Erro de comunicação ao remover escala.',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Seleção do Programa e Ações do Gestor */}
      <div className="bg-surface p-4 sm:p-5 rounded-surface border border-line flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <label htmlFor="program-select" className="block text-xs font-semibold text-ink-muted uppercase tracking-wider mb-1">
            Selecione o Programa / Culto
          </label>
          <select
            id="program-select"
            value={selectedProgramId}
            onChange={(e) => {
              setSelectedProgramId(e.target.value);
              setMessage(null);
              setActiveSlotId(null);
              setAutoPreview(null);
            }}
            className="px-3.5 py-2.5 bg-surface border border-field-border rounded-control text-ink font-semibold focus:ring-2 focus:ring-primary min-h-touch text-base"
          >
            {programs.map((prog) => (
              <option key={prog.id} value={prog.id}>
                {prog.title} —{' '}
                {new Date(prog.date).toLocaleDateString('pt-BR', {
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric',
                  timeZone: 'America/Sao_Paulo',
                })}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2 self-stretch sm:self-end flex-wrap sm:flex-nowrap">
          <button
            type="button"
            onClick={() => setShowPrintModal(true)}
            className="px-4 py-2.5 bg-surface border border-line text-ink hover:border-primary hover:text-primary font-semibold rounded-control text-sm transition-all min-h-touch flex items-center justify-center gap-2 shadow-sm flex-1 sm:flex-none"
            title="Visualizar e Imprimir Escala para Mural (Folha A4)"
          >
            <Printer size={18} />
            <span>Imprimir Mural A4</span>
          </button>

          {isManagerOrAdmin && currentProgram && (
            <button
              type="button"
              onClick={handleOpenAutoSchedule}
              disabled={loading || isGenerating}
              className="px-4 py-2.5 bg-primary text-white font-semibold rounded-control text-sm hover:opacity-95 transition-opacity min-h-touch flex items-center justify-center gap-2 shadow-sm flex-1 sm:flex-none"
            >
              <Sparkle size={18} weight="fill" />
              <span>{isGenerating ? 'Calculando escalas...' : 'Gerar Escala Automática'}</span>
            </button>
          )}
        </div>
      </div>

      {message && (
        <AlertBanner type={message.type} message={message.text} />
      )}

      {/* Grade de Slots do Programa Selecionado */}
      {currentProgram && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-display font-bold text-xl text-ink">
              Grade de Escalas: {currentProgram.title}
            </h2>
            <span className="text-xs text-ink-muted">
              {currentProgram.slots.length} partes/funções no cronograma
            </span>
          </div>

          <div className="bg-surface rounded-surface border border-line divide-y divide-line overflow-hidden shadow-sm">
            {currentProgram.slots.map((slot) => {
              const startsAt = new Date(slot.startsAt);
              const endsAt = new Date(slot.endsAt);
              const isSlotOpen = slot.assignments.length < slot.requiredCount;
              const canManageSlot = canManageAll || managedDepartmentIds.includes(slot.departmentId);

              // Voluntários compatíveis com o departamento do slot
              const candidateVolunteers = volunteers.filter((v) =>
                v.departmentIds.includes(slot.departmentId)
              );

              return (
                <div key={slot.id} className="p-4 sm:p-5 space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <div className="flex items-center space-x-2">
                        <span className="font-display font-bold text-base text-ink">
                          {slot.title}
                        </span>
                        {slot.functionName && (
                          <span className="text-xs bg-bg px-2 py-0.5 rounded-control text-ink-muted font-medium">
                            {slot.functionName}
                          </span>
                        )}
                        {isSlotOpen ? (
                          <span className="text-[11px] font-bold px-2 py-0.5 rounded-control bg-warning-soft text-warning-ink">
                            Vaga aberta ({slot.assignments.length}/{slot.requiredCount})
                          </span>
                        ) : (
                          <span className="text-[11px] font-bold px-2 py-0.5 rounded-control bg-success-soft text-success-ink">
                            Completa ({slot.assignments.length}/{slot.requiredCount})
                          </span>
                        )}
                      </div>
                      <span className="text-xs text-ink-muted">
                        {slot.departmentName} •{' '}
                        <span className="tabular-nums">
                          {startsAt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' })}{' '}
                          às {endsAt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' })}
                        </span>
                      </span>
                    </div>

                    {canManageSlot && (
                      <button
                        type="button"
                        onClick={() => {
                          setActiveSlotId(activeSlotId === slot.id ? null : slot.id);
                          setSelectedVolunteerId('');
                          setMessage(null);
                        }}
                        className="px-3.5 py-1.5 bg-primary/10 text-primary hover:bg-primary hover:text-white text-xs font-semibold rounded-control transition-colors min-h-touch self-start sm:self-auto inline-flex items-center gap-1.5"
                      >
                        {activeSlotId === slot.id ? (
                          'Fechar'
                        ) : (
                          <>
                            <Plus size={14} weight="bold" /> Escalar voluntário
                          </>
                        )}
                      </button>
                    )}
                  </div>

                  {/* Formulário inline para escalar voluntário */}
                  {activeSlotId === slot.id && canManageSlot && (
                    <div className="p-3 bg-bg rounded-control border border-line space-y-3 mt-2">
                      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                        <select
                          value={selectedVolunteerId}
                          onChange={(e) => setSelectedVolunteerId(e.target.value)}
                          className="flex-1 px-3 py-2 bg-surface border border-field-border rounded-control text-sm text-ink min-h-touch"
                        >
                          <option value="">Selecione um voluntário...</option>
                          {candidateVolunteers.map((vol) => {
                            const unavailablePeriods =
                              vol.availabilities
                                ?.filter((a) => a.kind === 'UNAVAILABLE_PERIOD' && a.from && a.to)
                                .map((a) => ({ from: a.from!, to: a.to! })) || [];

                            const isUnavailable = isDateInUnavailablePeriods(
                              slot.startsAt,
                              slot.endsAt,
                              unavailablePeriods
                            );

                            const preferredDays =
                              vol.availabilities
                                ?.filter((a) => a.kind === 'PREFERRED_WEEKDAY' && typeof a.weekday === 'number')
                                .map((a) => a.weekday as number) || [];

                            const isOutsidePreferences = !matchesPreferredWeekdays(
                              slot.startsAt,
                              preferredDays
                            );

                            let tag = '';
                            if (isUnavailable) {
                              tag = ' [Indisponível no período]';
                            } else if (vol.isOverloaded) {
                              tag = ` [Sobrecarga: ${vol.consecutiveWeekendsCount ? `${vol.consecutiveWeekendsCount} fds seguidos` : 'recente'}]`;
                            } else if (isOutsidePreferences) {
                              tag = ' [Fora dos dias preferidos]';
                            }

                            return (
                              <option key={vol.id} value={vol.id} disabled={isUnavailable}>
                                {vol.name}
                                {tag}
                              </option>
                            );
                          })}
                        </select>

                        <button
                          type="button"
                          disabled={!selectedVolunteerId || loading}
                          onClick={() => handleAssign(slot.id)}
                          className="px-4 py-2 bg-primary text-white font-semibold text-xs rounded-control hover:opacity-95 disabled:opacity-50 min-h-touch inline-flex items-center justify-center gap-1.5"
                        >
                          <Check size={14} weight="bold" />
                          {loading ? 'Salvando...' : 'Confirmar escala'}
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Lista de voluntários escalados neste slot */}
                  <div className="pt-1">
                    {slot.assignments.length === 0 ? (
                      <p className="text-xs text-ink-muted italic">Nenhum voluntário escalado ainda.</p>
                    ) : (
                      <div className="space-y-1.5">
                        {slot.assignments.map((asg) => (
                          <div
                            key={asg.id}
                            className="flex items-center justify-between py-1.5 px-3 bg-bg rounded-control text-sm"
                          >
                            <div className="flex items-center space-x-2">
                              <span className={`w-2 h-2 rounded-full ${asg.status === 'PENDING_APPROVAL' ? 'bg-warning' : 'bg-primary'}`} />
                              <span className="font-semibold text-ink">{asg.userName}</span>
                              <span
                                className={`text-[10px] px-1.5 py-0.5 rounded-control font-bold uppercase ${
                                  asg.status === 'CONFIRMED'
                                    ? 'bg-success-soft text-success-ink'
                                    : asg.status === 'PENDING_APPROVAL'
                                    ? 'bg-warning-soft text-warning-ink border border-warning/40'
                                    : 'bg-info-soft text-primary'
                                }`}
                              >
                                {asg.status === 'CONFIRMED'
                                  ? 'Confirmado'
                                  : asg.status === 'PENDING_APPROVAL'
                                  ? 'Aguardando Líder'
                                  : 'Pendente'}
                              </span>
                            </div>

                            <div className="flex items-center space-x-2">
                              {asg.status === 'PENDING_APPROVAL' && canManageSlot && (
                                <button
                                  type="button"
                                  onClick={() => handleQuickApprove(asg.id)}
                                  className="text-xs bg-success text-white hover:bg-success/90 font-semibold px-2.5 py-1.5 rounded-control transition-colors shadow-sm min-h-touch inline-flex items-center gap-1"
                                  title="Aprovar escala preliminar gerada pela liderança"
                                >
                                  <Check size={14} weight="bold" /> Aprovar
                                </button>
                              )}

                              {asg.status !== 'PENDING_APPROVAL' && canManageSlot && (
                                <button
                                  type="button"
                                  onClick={() => handleCopyConfirmationLink(asg.id)}
                                  className="text-xs text-primary hover:underline font-semibold flex items-center space-x-1 px-2 py-1.5 rounded-control hover:bg-primary/5 transition-colors min-h-touch"
                                  title="Copiar mensagem com link de confirmação para o WhatsApp"
                                >
                                  {copiedAssignmentId === asg.id ? (
                                    <>
                                      <Check size={14} weight="bold" />
                                      <span>Copiado!</span>
                                    </>
                                  ) : (
                                    <>
                                      <WhatsappLogo size={14} />
                                      <span>Link WhatsApp</span>
                                    </>
                                  )}
                                </button>
                              )}

                              {canManageSlot && (
                                <button
                                  type="button"
                                  onClick={() => setPendingRemoveAssignmentId(asg.id)}
                                  className="text-xs text-ink-muted hover:text-danger font-semibold p-1.5 min-h-touch min-w-touch flex items-center justify-center rounded-control transition-colors"
                                  title="Remover da escala"
                                >
                                  <Trash size={15} />
                                </button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Modal de Prévia e Aplicação de Geração Automática */}
      {showAutoModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Prévia da Geração Automática"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fade-in"
        >
          <div className="bg-surface rounded-surface border border-line max-w-2xl w-full max-h-[90vh] flex flex-col shadow-xl overflow-hidden">
            {/* Cabeçalho do Modal */}
            <div className="p-4 sm:p-5 border-b border-line flex items-center justify-between bg-bg/50">
              <div className="flex items-center gap-2">
                <Sparkle size={20} weight="fill" className="text-primary flex-shrink-0" />
                <div>
                  <h3 className="font-display font-bold text-lg text-ink">
                    Prévia da Geração Automática
                  </h3>
                  <p className="text-xs text-ink-muted">
                    {currentProgram?.title}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowAutoModal(false)}
                className="text-ink-muted hover:text-ink p-1 rounded-control min-h-touch min-w-[44px] flex items-center justify-center"
                aria-label="Fechar modal"
              >
                <X size={20} />
              </button>
            </div>

            {/* Conteúdo do Modal */}
            <div className="p-4 sm:p-5 overflow-y-auto flex-1 space-y-4">
              {isGenerating ? (
                <div className="py-12 text-center space-y-3">
                  <div className="w-8 h-8 border-3 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
                  <p className="text-sm font-semibold text-ink">
                    Calculando melhor distribuição e avaliando histórico...
                  </p>
                  <p className="text-xs text-ink-muted">
                    Verificando disponibilidade, limites diários e ausência de conflitos.
                  </p>
                </div>
              ) : autoPreview ? (
                <>
                  {/* Resumo do cálculo */}
                  <div className="bg-primary/5 border border-primary/20 rounded-control p-3 flex items-center justify-between text-xs sm:text-sm">
                    <span className="text-ink font-semibold inline-flex items-center gap-1.5">
                      <Lightbulb size={16} className="text-primary flex-shrink-0" />
                      <span><strong className="tabular-nums">{autoPreview.totalFilled}</strong> sugestão(ões) de voluntários encontrada(s)</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        if (selectedProposals.size === autoPreview.proposals.length) {
                          setSelectedProposals(new Set());
                        } else {
                          setSelectedProposals(
                            new Set(autoPreview.proposals.map((p) => `${p.slotId}-${p.candidate.id}`))
                          );
                        }
                      }}
                      className="text-primary font-semibold hover:underline"
                    >
                      {selectedProposals.size === autoPreview.proposals.length
                        ? 'Desmarcar todas'
                        : 'Selecionar todas'}
                    </button>
                  </div>

                  {/* Lista de Atribuições Sugeridas */}
                  {autoPreview.proposals.length > 0 ? (
                    <div className="space-y-2">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-ink-muted">
                        Escalas Sugeridas para Atribuição
                      </h4>
                      <div className="divide-y divide-line border border-line rounded-control overflow-hidden bg-surface">
                        {autoPreview.proposals.map((prop) => {
                          const key = `${prop.slotId}-${prop.candidate.id}`;
                          const isChecked = selectedProposals.has(key);
                          const startsAt = new Date(prop.startsAt);

                          return (
                            <label
                              key={key}
                              className={`p-3 flex items-start gap-3 cursor-pointer transition-colors ${
                                isChecked ? 'bg-primary/5' : 'hover:bg-bg'
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={(e) => {
                                  const next = new Set(selectedProposals);
                                  if (e.target.checked) next.add(key);
                                  else next.delete(key);
                                  setSelectedProposals(next);
                                }}
                                className="mt-1 w-4 h-4 text-primary rounded border-line focus:ring-primary"
                              />
                              <div className="flex-1 space-y-0.5">
                                <div className="flex items-center justify-between">
                                  <span className="font-semibold text-sm text-ink">
                                    {prop.candidate.name}
                                  </span>
                                  <span className="text-xs text-ink-muted tabular-nums">
                                    {startsAt.toLocaleTimeString('pt-BR', {
                                      hour: '2-digit',
                                      minute: '2-digit',
                                      timeZone: 'America/Sao_Paulo',
                                    })}
                                  </span>
                                </div>
                                <p className="text-xs text-primary font-medium">
                                  {prop.slotTitle}
                                </p>
                                <p className="text-[11px] text-ink-muted">
                                  Critério: {prop.reason}
                                </p>
                              </div>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  ) : (
                    <div className="p-4 bg-bg rounded-control text-center text-sm text-ink-muted">
                      Nenhum slot necessita de atribuição ou não foram encontrados candidatos.
                    </div>
                  )}

                  {/* Vagas que permanecerão abertas */}
                  {autoPreview.unfilledSlots.length > 0 && (
                    <div className="space-y-2 pt-2">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-warning-ink inline-flex items-center gap-1.5">
                        <Warning size={16} weight="fill" className="text-warning flex-shrink-0" />
                        <span>Vagas que Permanecerão Abertas (<span className="tabular-nums">{autoPreview.unfilledSlots.length}</span>)</span>
                      </h4>
                      <div className="space-y-2">
                        {autoPreview.unfilledSlots.map((unfilled) => (
                          <div
                            key={unfilled.slotId}
                            className="p-3 bg-warning-soft/30 border border-warning/30 rounded-control text-xs space-y-1"
                          >
                            <div className="flex items-center justify-between font-semibold text-ink">
                              <span>{unfilled.slotTitle}</span>
                              <span className="text-warning-ink tabular-nums">
                                {unfilled.missingCount} vaga(s) sem candidato
                              </span>
                            </div>
                            <p className="text-ink-muted">{unfilled.diagnosis}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              ) : null}
            </div>

            {/* Rodapé de Ações */}
            <div className="p-4 sm:p-5 border-t border-line bg-bg/50 flex flex-col sm:flex-row items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowAutoModal(false)}
                className="w-full sm:w-auto px-4 py-2 border border-line rounded-control text-sm font-semibold text-ink-muted hover:text-ink min-h-touch"
              >
                Cancelar
              </button>

              <button
                type="button"
                onClick={handleApplyAutoSchedule}
                disabled={loading || isGenerating || selectedProposals.size === 0}
                className="w-full sm:w-auto px-5 py-2.5 bg-success text-white rounded-control text-sm font-semibold hover:bg-success/90 disabled:opacity-50 min-h-touch shadow-sm flex items-center justify-center gap-2"
              >
                <Check size={16} weight="bold" />
                <span>
                  {loading
                    ? 'Aplicando...'
                    : `Aplicar ${selectedProposals.size} Escala(s) Selecionada(s)`}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Impressão de Mural A4 */}
      <SchedulePrintModal
        isOpen={showPrintModal}
        onClose={() => setShowPrintModal(false)}
        programs={programs}
        currentProgramId={selectedProgramId}
      />

      <ConfirmDialog
        isOpen={Boolean(pendingRemoveAssignmentId)}
        onClose={() => setPendingRemoveAssignmentId(null)}
        onConfirm={() => {
          if (pendingRemoveAssignmentId) {
            void handleRemove(pendingRemoveAssignmentId);
          }
        }}
        title="Remover Voluntário da Escala"
        description="Deseja realmente remover este voluntário desta função na escala?"
        confirmLabel="Remover"
        variant="danger"
        loading={loading}
      />
    </div>
  );
}
