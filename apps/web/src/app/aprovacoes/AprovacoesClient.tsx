'use client';

import React, { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { AlertBanner } from '@/components/AlertBanner';
import {
  UsersThree,
  CalendarCheck,
  Check,
  PencilSimple,
  Trash,
  Phone,
  WhatsappLogo,
  Clock,
  Buildings,
  X,
} from '@/components/Icons';

export interface PendingUser {
  id: string;
  name: string;
  email: string;
  phonePrimary?: string | null;
  whatsapp?: string | null;
  birthDate?: string | null;
  createdAt: string;
}

export interface DepartmentWithFunctions {
  id: string;
  name: string;
  functions: { id: string; name: string }[];
}

export interface PendingScheduleAssignment {
  id: string;
  status: string;
  createdAt: string;
  userId: string;
  userName: string;
  userEmail: string;
  userPhone?: string | null;
  slotId: string;
  slotTitle: string;
  startsAt: string;
  endsAt: string;
  departmentId: string;
  departmentName: string;
  functionId?: string | null;
  functionName?: string | null;
  programId: string;
  programTitle: string;
  programDate: string;
}

export interface ActiveVolunteerOption {
  id: string;
  name: string;
  departmentIds: string[];
}

interface AprovacoesClientProps {
  pendingUsers: PendingUser[];
  departments: DepartmentWithFunctions[];
  pendingSchedules?: PendingScheduleAssignment[];
  activeVolunteers?: ActiveVolunteerOption[];
  initialTab?: 'users' | 'schedules';
}

export function AprovacoesClient({
  pendingUsers,
  departments,
  pendingSchedules = [],
  activeVolunteers = [],
  initialTab = 'users',
}: AprovacoesClientProps) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'users' | 'schedules'>(initialTab);

  // Estados da aba de usuários
  const [selectedUser, setSelectedUser] = useState<PendingUser | null>(null);
  const [targetDeptId, setTargetDeptId] = useState<string>(departments[0]?.id || '');
  const [selectedFunctionIds, setSelectedFunctionIds] = useState<string[]>([]);

  // Estados da aba de escalas pendentes
  const [selectedScheduleDeptId, setSelectedScheduleDeptId] = useState<string>('');
  const [selectedScheduleIds, setSelectedScheduleIds] = useState<Set<string>>(new Set());
  const [adjustingAssignment, setAdjustingAssignment] = useState<PendingScheduleAssignment | null>(null);
  const [newVolunteerId, setNewVolunteerId] = useState<string>('');

  const [message, setMessage] = useState<{ type: 'sucesso' | 'erro'; text: string } | null>(null);
  const [loading, setLoading] = useState(false);

  const activeDept = departments.find((d) => d.id === targetDeptId);

  // Filtro de escalas por departamento
  const filteredSchedules = useMemo(() => {
    if (!selectedScheduleDeptId) return pendingSchedules;
    return pendingSchedules.filter((s) => s.departmentId === selectedScheduleDeptId);
  }, [pendingSchedules, selectedScheduleDeptId]);

  // Departamentos disponíveis nas escalas pendentes
  const scheduleDepartments = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of pendingSchedules) {
      map.set(s.departmentId, s.departmentName);
    }
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [pendingSchedules]);

  // Voluntários elegíveis para troca no modal de ajuste (pertencem ao departamento do slot)
  const eligibleVolunteersForAdjustment = useMemo(() => {
    if (!adjustingAssignment) return [];
    return activeVolunteers.filter((v) =>
      v.departmentIds.includes(adjustingAssignment.departmentId)
    );
  }, [adjustingAssignment, activeVolunteers]);

  const handleFunctionToggle = (funcId: string) => {
    setSelectedFunctionIds((prev) =>
      prev.includes(funcId) ? prev.filter((id) => id !== funcId) : [...prev, funcId]
    );
  };

  // ---- Ações de Cadastro de Voluntário ----

  const handleApproveUser = async () => {
    if (!selectedUser || !targetDeptId) return;
    setMessage(null);
    setLoading(true);

    try {
      const res = await fetch('/api/aprovacoes/aprovar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: selectedUser.id,
          departmentId: targetDeptId,
          functionIds: selectedFunctionIds,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setMessage({ type: 'erro', text: data.error || 'Erro ao aprovar cadastro.' });
        return;
      }

      setMessage({ type: 'sucesso', text: `Cadastro de ${selectedUser.name} aprovado com sucesso!` });
      setSelectedUser(null);
      router.refresh();
    } catch {
      setMessage({ type: 'erro', text: 'Erro de comunicação ao aprovar cadastro.' });
    } finally {
      setLoading(false);
    }
  };

  const handleRejectUser = async (userId: string, name: string) => {
    if (!confirm(`Deseja realmente rejeitar o cadastro de ${name}?`)) return;
    setMessage(null);
    setLoading(true);

    try {
      const res = await fetch('/api/aprovacoes/rejeitar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setMessage({ type: 'erro', text: data.error || 'Erro ao rejeitar cadastro.' });
        return;
      }

      setMessage({ type: 'sucesso', text: `Cadastro de ${name} rejeitado.` });
      router.refresh();
    } catch {
      setMessage({ type: 'erro', text: 'Erro ao rejeitar cadastro.' });
    } finally {
      setLoading(false);
    }
  };

  // ---- Ações de Escalas Pendentes de Aprovação ----

  const handleToggleSelectSchedule = (id: string) => {
    setSelectedScheduleIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleToggleSelectAllSchedules = () => {
    if (selectedScheduleIds.size === filteredSchedules.length) {
      setSelectedScheduleIds(new Set());
    } else {
      setSelectedScheduleIds(new Set(filteredSchedules.map((s) => s.id)));
    }
  };

  const handleApproveSchedules = async (assignmentIds: string[]) => {
    if (assignmentIds.length === 0) return;
    setMessage(null);
    setLoading(true);

    try {
      const res = await fetch('/api/escalas/aprovar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assignmentIds }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setMessage({ type: 'erro', text: data.error || 'Erro ao aprovar escalas.' });
        return;
      }

      setMessage({
        type: 'sucesso',
        text: data.message || `${assignmentIds.length} escala(s) aprovada(s) com sucesso!`,
      });
      setSelectedScheduleIds(new Set());
      router.refresh();
    } catch {
      setMessage({ type: 'erro', text: 'Falha de comunicação ao aprovar escalas.' });
    } finally {
      setLoading(false);
    }
  };

  const handleAdjustAndApproveSchedule = async () => {
    if (!adjustingAssignment || !newVolunteerId) return;
    setMessage(null);
    setLoading(true);

    try {
      const res = await fetch('/api/escalas/aprovar', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          assignmentId: adjustingAssignment.id,
          newUserId: newVolunteerId,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setMessage({ type: 'erro', text: data.error || 'Erro ao ajustar escala.' });
        return;
      }

      setMessage({
        type: 'sucesso',
        text: 'Voluntário substituído e escala aprovada com sucesso!',
      });
      setAdjustingAssignment(null);
      setNewVolunteerId('');
      router.refresh();
    } catch {
      setMessage({ type: 'erro', text: 'Erro ao comunicar ajuste da escala.' });
    } finally {
      setLoading(false);
    }
  };

  const handleRejectSchedules = async (assignmentIds: string[]) => {
    if (!confirm(`Deseja rejeitar e remover ${assignmentIds.length} escala(s) preliminar(es)?`)) return;
    setMessage(null);
    setLoading(true);

    try {
      const res = await fetch('/api/escalas/aprovar', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          assignmentIds,
          reason: 'Rejeitado pelo líder do departamento',
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setMessage({ type: 'erro', text: data.error || 'Erro ao rejeitar escalas.' });
        return;
      }

      setMessage({
        type: 'sucesso',
        text: data.message || 'Escala(s) rejeitada(s) e vagas reabertas.',
      });
      router.refresh();
    } catch {
      setMessage({ type: 'erro', text: 'Erro ao rejeitar escalas.' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {message && <AlertBanner type={message.type} message={message.text} />}

      {/* Navegação entre Abas: Novos Voluntários vs Escalas Pendentes */}
      <div className="flex border-b border-line">
        <button
          type="button"
          onClick={() => setActiveTab('users')}
          className={`flex-1 sm:flex-none px-6 py-3 text-center text-xs sm:text-sm font-bold border-b-2 transition-all flex items-center justify-center gap-2 min-h-touch ${
            activeTab === 'users'
              ? 'border-primary text-primary'
              : 'border-transparent text-ink-muted hover:text-ink'
          }`}
        >
          <UsersThree size={18} weight={activeTab === 'users' ? 'fill' : 'regular'} />
          <span>Novos Cadastros</span>
          <span className={`px-2 py-0.5 rounded-full text-xs font-bold tabular-nums ${
            pendingUsers.length > 0 ? 'bg-primary/10 text-primary' : 'bg-bg text-ink-muted'
          }`}>
            {pendingUsers.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('schedules')}
          className={`flex-1 sm:flex-none px-6 py-3 text-center text-xs sm:text-sm font-bold border-b-2 transition-all flex items-center justify-center gap-2 min-h-touch ${
            activeTab === 'schedules'
              ? 'border-primary text-primary'
              : 'border-transparent text-ink-muted hover:text-ink'
          }`}
        >
          <CalendarCheck size={18} weight={activeTab === 'schedules' ? 'fill' : 'regular'} />
          <span>Escalas Aguardando Aprovação</span>
          <span className={`px-2 py-0.5 rounded-full text-xs font-bold tabular-nums ${
            pendingSchedules.length > 0 ? 'bg-warning-soft text-warning-ink border border-warning/40' : 'bg-bg text-ink-muted'
          }`}>
            {pendingSchedules.length}
          </span>
        </button>
      </div>

      {/* ABA 1: NOVOS CADASTROS */}
      {activeTab === 'users' && (
        <>
          {pendingUsers.length === 0 ? (
            <div className="bg-surface rounded-surface border border-line p-8 text-center shadow-sm">
              <p className="text-ink-muted text-sm">Não há cadastros pendentes de aprovação no momento.</p>
            </div>
          ) : (
            <div className="bg-surface rounded-surface border border-line divide-y divide-line overflow-hidden shadow-sm">
              {pendingUsers.map((user) => (
                <div key={user.id} className="p-4 sm:p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:bg-bg/40 transition-colors">
                  <div>
                    <h3 className="font-display font-bold text-base text-ink">{user.name}</h3>
                    <p className="text-xs text-ink-muted mt-0.5">{user.email}</p>
                    <div className="flex flex-wrap items-center gap-3 text-xs text-ink-muted mt-2">
                      {user.phonePrimary && (
                        <span className="inline-flex items-center gap-1">
                          <Phone size={14} className="text-ink-muted flex-shrink-0" />
                          <span className="tabular-nums">{user.phonePrimary}</span>
                        </span>
                      )}
                      {user.whatsapp && (
                        <span className="inline-flex items-center gap-1">
                          <WhatsappLogo size={14} className="text-success flex-shrink-0" />
                          <span className="tabular-nums">{user.whatsapp}</span>
                        </span>
                      )}
                      {user.birthDate && (
                        <span className="inline-flex items-center gap-1">
                          <Clock size={14} className="text-ink-muted flex-shrink-0" />
                          Nasc: <span className="tabular-nums">{new Date(user.birthDate).toLocaleDateString('pt-BR')}</span>
                        </span>
                      )}
                      <span className="inline-flex items-center gap-1">
                        <Clock size={14} className="text-ink-muted flex-shrink-0" />
                        Solicitado em: <span className="tabular-nums">{new Date(user.createdAt).toLocaleDateString('pt-BR')}</span>
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center space-x-2">
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedUser(user);
                        setTargetDeptId(departments[0]?.id || '');
                        setSelectedFunctionIds([]);
                      }}
                      className="px-4 py-2 bg-primary text-white font-semibold rounded-control text-xs sm:text-sm hover:bg-primary/90 transition-all shadow-sm min-h-touch inline-flex items-center gap-1.5"
                    >
                      <Check size={16} weight="bold" /> Vincular & Aprovar
                    </button>
                    <button
                      type="button"
                      disabled={loading}
                      onClick={() => handleRejectUser(user.id, user.name)}
                      className="px-3.5 py-2 border border-line text-ink-muted hover:text-danger hover:border-danger font-semibold rounded-control text-xs sm:text-sm transition-colors min-h-touch inline-flex items-center gap-1.5"
                    >
                      <Trash size={16} /> Rejeitar
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Modal de Aprovação de Usuário */}
          {selectedUser && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
              <div className="bg-surface rounded-surface border border-line max-w-md w-full p-6 shadow-2xl">
                <h2 className="font-display font-bold text-lg text-ink mb-1">Aprovar Voluntário</h2>
                <p className="text-xs text-ink-muted mb-4">
                  Defina o departamento e as funções iniciais de <strong>{selectedUser.name}</strong>.
                </p>

                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-ink-muted uppercase mb-1">
                      Departamento Inicial *
                    </label>
                    <select
                      value={targetDeptId}
                      onChange={(e) => {
                        setTargetDeptId(e.target.value);
                        setSelectedFunctionIds([]);
                      }}
                      className="w-full px-3 py-2 bg-surface border border-line rounded-control text-sm text-ink font-medium"
                    >
                      {departments.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  {activeDept && activeDept.functions.length > 0 && (
                    <div>
                      <label className="block text-xs font-semibold text-ink-muted uppercase mb-1">
                        Funções Habilitadas (opcional)
                      </label>
                      <div className="flex flex-wrap gap-2 pt-1 max-h-40 overflow-y-auto">
                        {activeDept.functions.map((f) => (
                          <button
                            key={f.id}
                            type="button"
                            onClick={() => handleFunctionToggle(f.id)}
                            className={`px-3 py-1.5 rounded-control text-xs font-semibold border transition-all min-h-touch ${
                              selectedFunctionIds.includes(f.id)
                                ? 'bg-primary text-white border-primary shadow-sm'
                                : 'bg-surface text-ink border-line hover:border-primary/50'
                            }`}
                          >
                            {f.name}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="flex items-center justify-end space-x-2 pt-4 border-t border-line">
                    <button
                      type="button"
                      onClick={() => setSelectedUser(null)}
                      className="px-4 py-2 border border-line text-ink-muted hover:text-ink text-xs font-semibold rounded-control min-h-touch"
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      disabled={loading || !targetDeptId}
                      onClick={handleApproveUser}
                      className="px-4 py-2 bg-primary text-white text-xs font-bold rounded-control hover:bg-primary/90 transition-all shadow-sm min-h-touch"
                    >
                      {loading ? 'Aprovando...' : 'Confirmar Aprovação'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* ABA 2: ESCALAS PENDENTES DE APROVAÇÃO */}
      {activeTab === 'schedules' && (
        <div className="space-y-4">
          {/* Barra de Filtro e Ações em Lote */}
          <div className="bg-surface rounded-surface border border-line p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm">
            <div className="flex items-center gap-3">
              <label htmlFor="dept-filter" className="text-xs font-semibold text-ink-muted uppercase tracking-wider">
                Departamento:
              </label>
              <select
                id="dept-filter"
                value={selectedScheduleDeptId}
                onChange={(e) => setSelectedScheduleDeptId(e.target.value)}
                className="bg-surface border border-line rounded-control px-3 py-2 text-sm text-ink font-medium"
              >
                <option value="">Todos ({pendingSchedules.length})</option>
                {scheduleDepartments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>

            {filteredSchedules.length > 0 && (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleToggleSelectAllSchedules}
                  className="px-3 py-1.5 border border-line rounded-control text-xs font-semibold text-ink hover:bg-bg transition-colors min-h-touch"
                >
                  {selectedScheduleIds.size === filteredSchedules.length ? 'Desmarcar Todas' : 'Selecionar Todas'}
                </button>

                {selectedScheduleIds.size > 0 && (
                  <button
                    type="button"
                    disabled={loading}
                    onClick={() => handleApproveSchedules(Array.from(selectedScheduleIds))}
                    className="px-4 py-1.5 bg-success text-white rounded-control text-xs font-bold hover:bg-success/90 transition-all shadow-sm flex items-center gap-1.5 min-h-touch"
                  >
                    <Check size={16} weight="bold" />
                    <span>Aprovar Selecionadas ({selectedScheduleIds.size})</span>
                  </button>
                )}
              </div>
            )}
          </div>

          {filteredSchedules.length === 0 ? (
            <div className="bg-surface rounded-surface border border-line p-8 text-center shadow-sm">
              <p className="text-ink-muted text-sm">
                Nenhuma escala preliminar aguardando aprovação para os seus departamentos.
              </p>
            </div>
          ) : (
            <div className="bg-surface rounded-surface border border-line divide-y divide-line overflow-hidden shadow-sm">
              {filteredSchedules.map((asg) => {
                const isSelected = selectedScheduleIds.has(asg.id);
                const startsAt = new Date(asg.startsAt);
                const endsAt = new Date(asg.endsAt);

                return (
                  <div
                    key={asg.id}
                    className={`p-4 sm:p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 transition-colors ${
                      isSelected ? 'bg-primary/5' : 'hover:bg-bg/40'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => handleToggleSelectSchedule(asg.id)}
                        className="mt-1 w-4 h-4 text-primary rounded border-line focus:ring-primary"
                      />

                      <div className="space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-display font-bold text-base text-ink">
                            {asg.userName}
                          </span>
                          <span className="text-[10px] px-2 py-0.5 rounded-control font-bold uppercase tracking-wider bg-warning-soft text-warning-ink border border-warning/40">
                            Aguardando Seu Aval
                          </span>
                        </div>

                        <p className="text-sm font-semibold text-ink flex items-center gap-1">
                          <Buildings size={14} className="text-primary flex-shrink-0" />
                          <span>{asg.departmentName} — {asg.functionName || asg.slotTitle}</span>
                        </p>

                        <p className="text-xs text-ink-muted">
                          Culto: <strong>{asg.programTitle}</strong> • {startsAt.toLocaleDateString('pt-BR', {
                            weekday: 'long',
                            day: 'numeric',
                            month: 'long',
                          })}{' '}
                          às <span className="tabular-nums">{startsAt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span> até <span className="tabular-nums">{endsAt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
                        </p>

                        <p className="text-[11px] text-ink-muted/80">
                          {asg.userEmail} {asg.userPhone ? `• ${asg.userPhone}` : ''}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 flex-wrap">
                      <button
                        type="button"
                        disabled={loading}
                        onClick={() => handleApproveSchedules([asg.id])}
                        className="px-4 py-2 bg-success text-white font-semibold rounded-control text-xs sm:text-sm hover:bg-success/90 transition-all shadow-sm min-h-touch inline-flex items-center gap-1.5"
                      >
                        <Check size={16} weight="bold" /> Aprovar
                      </button>

                      <button
                        type="button"
                        disabled={loading}
                        onClick={() => {
                          setAdjustingAssignment(asg);
                          setNewVolunteerId('');
                        }}
                        className="px-3.5 py-2 border border-line text-ink hover:border-primary font-semibold rounded-control text-xs sm:text-sm transition-colors min-h-touch inline-flex items-center gap-1.5"
                      >
                        <PencilSimple size={16} /> Ajustar Voluntário
                      </button>

                      <button
                        type="button"
                        disabled={loading}
                        onClick={() => handleRejectSchedules([asg.id])}
                        className="px-3 py-2 border border-line text-ink-muted hover:text-danger hover:border-danger font-semibold rounded-control text-xs sm:text-sm transition-colors min-h-touch inline-flex items-center gap-1.5"
                      >
                        <Trash size={16} /> Rejeitar
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Modal de Ajuste de Voluntário */}
          {adjustingAssignment && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
              <div className="bg-surface rounded-surface border border-line max-w-md w-full p-6 shadow-2xl">
                <h2 className="font-display font-bold text-lg text-ink mb-1">Ajustar Escala Preliminar</h2>
                <p className="text-xs text-ink-muted mb-4">
                  Substitua o voluntário sugerido (<strong>{adjustingAssignment.userName}</strong>) para a vaga de <strong>{adjustingAssignment.functionName || adjustingAssignment.slotTitle}</strong> no culto <em>{adjustingAssignment.programTitle}</em>.
                </p>

                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-ink-muted uppercase mb-1">
                      Selecione o Novo Voluntário do Departamento *
                    </label>
                    <select
                      value={newVolunteerId}
                      onChange={(e) => setNewVolunteerId(e.target.value)}
                      className="w-full px-3 py-2 bg-surface border border-line rounded-control text-sm text-ink font-medium"
                    >
                      <option value="">Selecione um voluntário...</option>
                      {eligibleVolunteersForAdjustment.map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="flex items-center justify-end space-x-2 pt-4 border-t border-line">
                    <button
                      type="button"
                      onClick={() => {
                        setAdjustingAssignment(null);
                        setNewVolunteerId('');
                      }}
                      className="px-4 py-2 border border-line text-ink-muted hover:text-ink text-xs font-semibold rounded-control min-h-touch"
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      disabled={loading || !newVolunteerId}
                      onClick={handleAdjustAndApproveSchedule}
                      className="px-4 py-2 bg-success text-white text-xs font-bold rounded-control hover:bg-success/90 transition-all shadow-sm disabled:opacity-50 min-h-touch inline-flex items-center gap-1.5"
                    >
                      <Check size={16} weight="bold" />
                      {loading ? 'Salvando...' : 'Salvar & Aprovar Escala'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
