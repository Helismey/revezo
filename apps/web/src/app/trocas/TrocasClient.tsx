'use client';

import React, { useState, useEffect } from 'react';
import { AlertBanner } from '@/components/AlertBanner';
import { Modal, ConfirmDialog } from '@/components/Modal';

interface PotentialTarget {
  id: string;
  name: string;
  photoUrl: string | null;
  memberships: {
    departmentId: string;
    functions: { functionId: string }[];
  }[];
}

interface MyAssignment {
  id: string;
  programTitle: string;
  departmentId: string;
  departmentName: string;
  functionId?: string | null;
  functionName: string;
  startsAt: string;
  endsAt: string;
}

interface SwapItem {
  id: string;
  assignmentId: string;
  requesterId: string;
  targetUserId?: string | null;
  targetAssignmentId?: string | null;
  status: 'PENDING_TARGET' | 'PENDING_MANAGER' | 'APPROVED' | 'REJECTED' | 'CANCELLED';
  reason?: string | null;
  managerNotes?: string | null;
  createdAt: string;
  updatedAt: string;
  requester?: { id: string; name: string; photoUrl: string | null };
  targetUser?: { id: string; name: string; photoUrl: string | null } | null;
  reviewedBy?: { id: string; name: string } | null;
  assignment: {
    slot: {
      program: { title: string };
      department: { name: string };
      function?: { name: string } | null;
      title: string;
      startsAt: string;
      endsAt: string;
    };
  };
}

interface TrocasClientProps {
  userId: string;
  isAdmin: boolean;
  isManager: boolean;
  myFutureAssignments: MyAssignment[];
  potentialTargets: PotentialTarget[];
}

export default function TrocasClient({
  userId,
  isAdmin,
  isManager,
  myFutureAssignments,
  potentialTargets,
}: TrocasClientProps) {
  const [activeTab, setActiveTab] = useState<'recebidas' | 'solicitadas' | 'aprovacoes'>(
    isManager || isAdmin ? 'aprovacoes' : 'recebidas'
  );
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [solicitadas, setSolicitadas] = useState<SwapItem[]>([]);
  const [recebidas, setRecebidas] = useState<SwapItem[]>([]);
  const [paraAprovacao, setParaAprovacao] = useState<SwapItem[]>([]);

  // Modal de novo pedido de troca
  const [showModal, setShowModal] = useState(false);
  const [selectedAssignmentId, setSelectedAssignmentId] = useState(myFutureAssignments[0]?.id || '');
  const [selectedTargetUserId, setSelectedTargetUserId] = useState('');
  const [swapReason, setSwapReason] = useState('');
  const [cancelSwapId, setCancelSwapId] = useState<string | null>(null);
  const [rejectSwapId, setRejectSwapId] = useState<string | null>(null);

  // Carrega lista de trocas
  async function loadSwaps() {
    setLoading(true);
    try {
      const res = await fetch('/api/trocas');
      const data = await res.json();
      if (data.success) {
        setSolicitadas(data.data.solicitadas || []);
        setRecebidas(data.data.recebidas || []);
        setParaAprovacao(data.data.paraAprovacao || []);
      } else {
        setError(data.error || 'Erro ao carregar trocas');
      }
    } catch {
      setError('Erro de conexão ao carregar trocas');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadSwaps();
  }, []);

  // Solicitar nova troca
  async function handleCreateSwap(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedAssignmentId) return;

    setSubmitting(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch('/api/trocas/solicitar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          assignmentId: selectedAssignmentId,
          targetUserId: selectedTargetUserId || undefined,
          reason: swapReason || undefined,
        }),
      });

      const data = await res.json();
      if (data.success) {
        setSuccess('Solicitação de troca enviada com sucesso!');
        setShowModal(false);
        setSwapReason('');
        loadSwaps();
      } else {
        setError(data.error || 'Falha ao solicitar troca');
      }
    } catch {
      setError('Erro de conexão ao solicitar troca');
    } finally {
      setSubmitting(false);
    }
  }

  // Responder a um pedido (Aceitar ou Recusar)
  async function handleRespond(swapRequestId: string, action: 'ACCEPT' | 'REJECT') {
    setSubmitting(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch('/api/trocas/responder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ swapRequestId, action }),
      });

      const data = await res.json();
      if (data.success) {
        setSuccess(
          action === 'ACCEPT'
            ? 'Troca aceita! O pedido foi encaminhado para aprovação do gestor.'
            : 'Proposta de troca recusada.'
        );
        loadSwaps();
      } else {
        setError(data.error || 'Erro ao processar resposta');
      }
    } catch {
      setError('Erro de conexão ao responder pedido');
    } finally {
      setSubmitting(false);
    }
  }

  // Cancelar pedido
  async function handleCancel(swapRequestId: string) {
    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch('/api/trocas/cancelar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ swapRequestId }),
      });

      const data = await res.json();
      if (data.success) {
        setSuccess('Pedido de troca cancelado.');
        setCancelSwapId(null);
        loadSwaps();
      } else {
        setError(data.error || 'Erro ao cancelar pedido');
      }
    } catch {
      setError('Erro de conexão ao cancelar');
    } finally {
      setSubmitting(false);
    }
  }

  // Aprovar ou Rejeitar pelo Gestor
  async function handleReview(swapRequestId: string, action: 'APPROVE' | 'REJECT', notes?: string) {
    setSubmitting(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch('/api/trocas/aprovar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ swapRequestId, action, notes }),
      });

      const data = await res.json();
      if (data.success) {
        setSuccess(
          action === 'APPROVE'
            ? 'Troca aprovada com sucesso! A escala foi atualizada automaticamente.'
            : 'Troca rejeitada.'
        );
        loadSwaps();
      } else {
        setError(data.error || 'Erro ao revisar troca');
      }
    } catch {
      setError('Erro de conexão ao revisar troca');
    } finally {
      setSubmitting(false);
    }
  }

  // Filtra voluntários compatíveis com o slot selecionado
  const currentSelectedAssignment = myFutureAssignments.find((a) => a.id === selectedAssignmentId);
  const eligibleTargets = potentialTargets.filter((pt) => {
    if (!currentSelectedAssignment) return true;
    const mem = pt.memberships.find((m) => m.departmentId === currentSelectedAssignment.departmentId);
    if (!mem) return false;
    if (currentSelectedAssignment.functionId) {
      return mem.functions.some((f) => f.functionId === currentSelectedAssignment.functionId);
    }
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Cabeçalho */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display font-bold text-2xl sm:text-3xl text-ink">Trocas de Escala</h1>
          <p className="text-sm text-ink-muted mt-1">
            Proponha trocas de dias com colegas de ministério com aprovação do gestor.
          </p>
        </div>

        {myFutureAssignments.length > 0 && (
          <button
            onClick={() => setShowModal(true)}
            className="px-4 py-2.5 bg-primary text-white font-semibold rounded-control text-sm hover:opacity-95 min-h-touch self-start sm:self-auto shadow-sm"
          >
            + Pedir Troca de Escala
          </button>
        )}
      </div>

      {error && <AlertBanner type="erro" message={error} />}
      {success && <AlertBanner type="sucesso" message={success} />}

      {/* Abas */}
      <div className="flex border-b border-line gap-2 overflow-x-auto">
        {(isManager || isAdmin) && (
          <button
            onClick={() => setActiveTab('aprovacoes')}
            className={`pb-3 px-3 font-semibold text-sm border-b-2 whitespace-nowrap transition-colors flex items-center gap-1.5 ${
              activeTab === 'aprovacoes'
                ? 'border-primary text-primary'
                : 'border-transparent text-ink-muted hover:text-ink'
            }`}
          >
            Aprovações Pendentes
            {paraAprovacao.length > 0 && (
              <span className="bg-warning text-white text-xs px-2 py-0.5 rounded-full font-bold">
                {paraAprovacao.length}
              </span>
            )}
          </button>
        )}

        <button
          onClick={() => setActiveTab('recebidas')}
          className={`pb-3 px-3 font-semibold text-sm border-b-2 whitespace-nowrap transition-colors flex items-center gap-1.5 ${
            activeTab === 'recebidas'
              ? 'border-primary text-primary'
              : 'border-transparent text-ink-muted hover:text-ink'
          }`}
        >
          Pedidos Recebidos
          {recebidas.length > 0 && (
            <span className="bg-primary text-white text-xs px-2 py-0.5 rounded-full font-bold">
              {recebidas.length}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('solicitadas')}
          className={`pb-3 px-3 font-semibold text-sm border-b-2 whitespace-nowrap transition-colors flex items-center gap-1.5 ${
            activeTab === 'solicitadas'
              ? 'border-primary text-primary'
              : 'border-transparent text-ink-muted hover:text-ink'
          }`}
        >
          Minhas Solicitações
          {solicitadas.length > 0 && (
            <span className="bg-bg text-ink-muted text-xs px-2 py-0.5 rounded-full font-semibold">
              {solicitadas.length}
            </span>
          )}
        </button>
      </div>

      {loading ? (
        <div className="text-center py-12 text-ink-muted text-sm">Carregando trocas...</div>
      ) : (
        <div className="space-y-4">
          {/* Aba: Aprovações do Gestor */}
          {activeTab === 'aprovacoes' && (
            <>
              {paraAprovacao.length === 0 ? (
                <div className="bg-surface rounded-surface border border-line p-8 text-center text-ink-muted text-sm">
                  Nenhum pedido de troca aguardando sua aprovação no momento.
                </div>
              ) : (
                paraAprovacao.map((item) => {
                  const startsAt = new Date(item.assignment.slot.startsAt);
                  return (
                    <div
                      key={item.id}
                      className="bg-surface rounded-surface border border-line p-5 shadow-sm space-y-3"
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div>
                          <span className="text-xs font-bold uppercase tracking-wider text-warning-ink bg-warning-soft px-2 py-0.5 rounded-control">
                            Aguardando Aprovação do Gestor
                          </span>
                          <h3 className="font-display font-bold text-lg text-ink mt-1">
                            {item.assignment.slot.program.title}
                          </h3>
                          <p className="text-xs text-ink-muted">
                            {item.assignment.slot.department.name} • {item.assignment.slot.function?.name || item.assignment.slot.title}
                          </p>
                        </div>

                        <div className="text-xs text-ink-muted sm:text-right">
                          {startsAt.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'short', timeZone: 'America/Sao_Paulo' })} •{' '}
                          {startsAt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' })}
                        </div>
                      </div>

                      <div className="bg-bg p-3.5 rounded-surface text-sm border border-line flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                        <div>
                          <p className="text-ink">
                            <strong>Solicitante:</strong> {item.requester?.name}
                          </p>
                          <p className="text-ink">
                            <strong>Substituto voluntário:</strong> {item.targetUser?.name || 'Qualquer voluntário'}
                          </p>
                          {item.reason && (
                            <p className="text-xs text-ink-muted mt-1 italic">
                              Motivo informado: &quot;{item.reason}&quot;
                            </p>
                          )}
                        </div>

                        <div className="flex items-center gap-2 self-end sm:self-center">
                          <button
                            disabled={submitting}
                            onClick={() => handleReview(item.id, 'APPROVE')}
                            className="px-4 py-2 bg-success text-white font-semibold text-xs sm:text-sm rounded-control hover:opacity-95 min-h-touch"
                          >
                            Aprovar Troca
                          </button>
                          <button
                            disabled={submitting}
                            onClick={() => setRejectSwapId(item.id)}
                            className="px-3.5 py-2 border border-line text-ink-muted hover:text-danger hover:border-danger font-semibold text-xs sm:text-sm rounded-control min-h-touch"
                          >
                            Rejeitar
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </>
          )}

          {/* Aba: Pedidos Recebidos */}
          {activeTab === 'recebidas' && (
            <>
              {recebidas.length === 0 ? (
                <div className="bg-surface rounded-surface border border-line p-8 text-center text-ink-muted text-sm">
                  Você não possui pedidos de troca pendentes para resposta.
                </div>
              ) : (
                recebidas.map((item) => {
                  const startsAt = new Date(item.assignment.slot.startsAt);
                  return (
                    <div
                      key={item.id}
                      className="bg-surface rounded-surface border border-line p-5 shadow-sm space-y-3"
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div>
                          <h3 className="font-display font-bold text-lg text-ink">
                            {item.assignment.slot.program.title}
                          </h3>
                          <p className="text-xs text-ink-muted">
                            {item.assignment.slot.department.name} • {item.assignment.slot.function?.name || item.assignment.slot.title}
                          </p>
                        </div>

                        <div className="text-xs text-ink-muted sm:text-right">
                          {startsAt.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'short', timeZone: 'America/Sao_Paulo' })} •{' '}
                          {startsAt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' })}
                        </div>
                      </div>

                      <div className="bg-bg p-3.5 rounded-surface text-sm border border-line flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                        <div>
                          <p className="text-ink">
                            <strong>{item.requester?.name}</strong> gostaria de passar esta escala para você.
                          </p>
                          {item.reason && (
                            <p className="text-xs text-ink-muted mt-1 italic">
                              Motivo: &quot;{item.reason}&quot;
                            </p>
                          )}
                        </div>

                        <div className="flex items-center gap-2 self-end sm:self-center">
                          <button
                            disabled={submitting}
                            onClick={() => handleRespond(item.id, 'ACCEPT')}
                            className="px-4 py-2 bg-primary text-white font-semibold text-xs sm:text-sm rounded-control hover:opacity-95 min-h-touch"
                          >
                            Aceitar Troca
                          </button>
                          <button
                            disabled={submitting}
                            onClick={() => handleRespond(item.id, 'REJECT')}
                            className="px-3.5 py-2 border border-line text-ink-muted hover:text-danger hover:border-danger font-semibold text-xs sm:text-sm rounded-control min-h-touch"
                          >
                            Não Posso
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </>
          )}

          {/* Aba: Minhas Solicitações */}
          {activeTab === 'solicitadas' && (
            <>
              {solicitadas.length === 0 ? (
                <div className="bg-surface rounded-surface border border-line p-8 text-center text-ink-muted text-sm">
                  Você ainda não solicitou nenhuma troca de escala.
                </div>
              ) : (
                solicitadas.map((item) => {
                  const startsAt = new Date(item.assignment.slot.startsAt);
                  const statusMap: Record<string, { label: string; badge: string }> = {
                    PENDING_TARGET: { label: 'Aguardando colega', badge: 'bg-info-soft text-primary' },
                    PENDING_MANAGER: { label: 'Aguardando gestor', badge: 'bg-warning-soft text-warning-ink' },
                    APPROVED: { label: 'Aprovada', badge: 'bg-success-soft text-success-ink' },
                    REJECTED: { label: 'Recusada', badge: 'bg-danger-soft text-danger-ink' },
                    CANCELLED: { label: 'Cancelada', badge: 'bg-bg text-ink-muted' },
                  };
                  const currentStatus = statusMap[item.status] || { label: item.status, badge: 'bg-bg text-ink' };

                  return (
                    <div
                      key={item.id}
                      className="bg-surface rounded-surface border border-line p-5 shadow-sm space-y-3"
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className={`text-[11px] font-bold px-2 py-0.5 rounded-control uppercase tracking-wider ${currentStatus.badge}`}>
                              {currentStatus.label}
                            </span>
                            <span className="text-xs text-ink-muted">
                              Proposto para: {item.targetUser?.name || 'Equipe aberta'}
                            </span>
                          </div>
                          <h3 className="font-display font-bold text-lg text-ink mt-1">
                            {item.assignment.slot.program.title}
                          </h3>
                          <p className="text-xs text-ink-muted">
                            {item.assignment.slot.department.name} • {item.assignment.slot.function?.name || item.assignment.slot.title}
                          </p>
                        </div>

                        <div className="text-xs text-ink-muted sm:text-right">
                          {startsAt.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'short', timeZone: 'America/Sao_Paulo' })} •{' '}
                          {startsAt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' })}
                        </div>
                      </div>

                      {item.reason && (
                        <p className="text-xs text-ink-muted bg-bg p-2.5 rounded-surface border border-line italic">
                          Motivo: {item.reason}
                        </p>
                      )}

                      {item.managerNotes && (
                        <p className="text-xs text-warning-ink bg-warning-soft/30 p-2.5 rounded-surface border border-warning/30 font-medium">
                          Observação do gestor: {item.managerNotes}
                        </p>
                      )}

                      {(item.status === 'PENDING_TARGET' || item.status === 'PENDING_MANAGER') && (
                        <div className="pt-2 flex justify-end">
                          <button
                            disabled={submitting}
                            onClick={() => setCancelSwapId(item.id)}
                            className="text-xs text-danger hover:underline font-semibold"
                          >
                            Cancelar Pedido
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </>
          )}
        </div>
      )}

      {/* Modal: Solicitar Troca */}
      <Modal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title="Pedir Troca de Escala"
      >
        <form onSubmit={handleCreateSwap} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-ink-muted uppercase tracking-wider mb-1.5">
              Selecione sua Escala
            </label>
            <select
              value={selectedAssignmentId}
              onChange={(e) => setSelectedAssignmentId(e.target.value)}
              className="w-full bg-bg border border-line rounded-control px-3.5 py-2.5 text-sm text-ink font-medium focus:outline-none focus:border-primary"
            >
              {myFutureAssignments.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.programTitle} — {a.departmentName} ({new Date(a.startsAt).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', timeZone: 'America/Sao_Paulo' })})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold text-ink-muted uppercase tracking-wider mb-1.5">
              Substituto Indicado
            </label>
            <select
              value={selectedTargetUserId}
              onChange={(e) => setSelectedTargetUserId(e.target.value)}
              className="w-full bg-bg border border-line rounded-control px-3.5 py-2.5 text-sm text-ink font-medium focus:outline-none focus:border-primary"
            >
              <option value="">Abrir para qualquer voluntário da equipe</option>
              {eligibleTargets.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
            <p className="text-[11px] text-ink-muted mt-1">
              Apenas voluntários com a mesma função no departamento são listados.
            </p>
          </div>

          <div>
            <label className="block text-xs font-bold text-ink-muted uppercase tracking-wider mb-1.5">
              Motivo da Troca (Opcional)
            </label>
            <textarea
              value={swapReason}
              onChange={(e) => setSwapReason(e.target.value)}
              maxLength={300}
              rows={3}
              placeholder="Ex.: Viagem de trabalho no fim de semana..."
              className="w-full bg-bg border border-line rounded-control p-3 text-sm text-ink focus:outline-none focus:border-primary"
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => setShowModal(false)}
              className="px-4 py-2 border border-line text-ink-muted font-semibold text-sm rounded-control hover:text-ink min-h-touch"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-5 py-2 bg-primary text-white font-semibold text-sm rounded-control hover:opacity-95 min-h-touch disabled:opacity-50"
            >
              {submitting ? 'Enviando...' : 'Enviar Solicitação'}
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        isOpen={Boolean(cancelSwapId)}
        onClose={() => setCancelSwapId(null)}
        onConfirm={() => {
          if (cancelSwapId) void handleCancel(cancelSwapId);
        }}
        title="Cancelar Pedido de Troca"
        description="Deseja realmente cancelar esta solicitação de troca?"
        confirmLabel="Cancelar Pedido"
        variant="danger"
        loading={submitting}
      />

      <ConfirmDialog
        isOpen={Boolean(rejectSwapId)}
        onClose={() => setRejectSwapId(null)}
        onConfirm={(notes) => {
          if (rejectSwapId) {
            const id = rejectSwapId;
            setRejectSwapId(null);
            void handleReview(id, 'REJECT', notes);
          }
        }}
        title="Rejeitar Troca de Escala"
        description="Informe opcionalmente o motivo da rejeição para o voluntário."
        confirmLabel="Rejeitar Troca"
        variant="danger"
        loading={submitting}
        withInput
        inputLabel="Motivo da rejeição (opcional)"
        inputPlaceholder="Ex.: Conflito de escala na equipe..."
      />
    </div>
  );
}
